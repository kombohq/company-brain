#!/usr/bin/env bash
#
# Cut a release: bump the version, roll CHANGELOG's [Unreleased] section into a
# dated version section, commit, tag, push, and create the GitHub release.
#
# Usage:
#   bun run release [patch|minor|major|X.Y.Z] [--dry-run] [--allow-empty]
#
#   patch (default)  bump the patch component (1.2.3 -> 1.2.4)
#   minor            bump the minor component (1.2.3 -> 1.3.0)
#   major            bump the major component (1.2.3 -> 2.0.0)
#   X.Y.Z            set an explicit version
#
#   --dry-run        print what would happen without writing, committing, or pushing
#   --allow-empty    allow a release even when [Unreleased] has no entries
#
# The logic is split into pure helper functions (no side effects, unit-tested
# in scripts/release_test.sh) and main() which wires them to git/gh. Sourcing
# this file defines the helpers without running anything.

# ---------------------------------------------------------------------------
# Pure helpers (no side effects; covered by scripts/release_test.sh)
# ---------------------------------------------------------------------------

# Compute the next version from a current "X.Y.Z" plus a bump keyword, or echo
# an explicit "X.Y.Z" verbatim. Returns 1 on an unrecognized bump.
bump_version() {
  local current="$1" bump="$2" major minor patch
  if [[ "$bump" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "$bump"
    return 0
  fi
  IFS='.' read -r major minor patch <<<"$current"
  case "$bump" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
    *) return 1 ;;
  esac
}

# Print the body under a "## [heading]" line (matched by prefix), up to the
# next "## " heading. Reads the changelog on stdin.
section_body() {
  awk -v prefix="$1" '
    index($0, prefix) == 1 { capture = 1; next }
    /^## / && capture { exit }
    capture { print }
  '
}

# Succeed if the argument contains any non-whitespace character.
has_content() { [[ -n "${1//[[:space:]]/}" ]]; }

# Insert a "## [version] - date" heading directly under "## [Unreleased]",
# leaving a fresh empty [Unreleased] on top. Reads the changelog on stdin.
insert_release_section() {
  awk -v ver="$1" -v date="$2" '
    !done && /^## \[Unreleased\]/ {
      print
      print ""
      print "## [" ver "] - " date
      done = 1
      next
    }
    { print }
  '
}

# Drop blank lines (turns a section body into compact release notes). Reads stdin.
strip_blank_lines() { sed '/^[[:space:]]*$/d'; }

# ---------------------------------------------------------------------------
# Side-effecting helpers
# ---------------------------------------------------------------------------

read_pkg_version() {
  bun -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$1', 'utf8')).version)"
}

write_pkg_version() {
  bun -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$1', 'utf8'));
    p.version = '$2';
    fs.writeFileSync('$1', JSON.stringify(p, null, 2) + '\n');
  "
}

die() {
  echo "error: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

main() {
  set -euo pipefail

  local repo_root
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$repo_root"

  local pkg="package.json" changelog="CHANGELOG.md"
  local bump="patch" dry_run=false allow_empty=false arg
  for arg in "$@"; do
    case "$arg" in
      patch | minor | major) bump="$arg" ;;
      [0-9]*.[0-9]*.[0-9]*) bump="$arg" ;;
      --dry-run) dry_run=true ;;
      --allow-empty) allow_empty=true ;;
      *)
        echo "error: unknown argument '$arg'" >&2
        echo "usage: bun run release [patch|minor|major|X.Y.Z] [--dry-run] [--allow-empty]" >&2
        exit 1
        ;;
    esac
  done

  # --- Preflight -----------------------------------------------------------

  command -v gh >/dev/null 2>&1 || die "gh CLI not found; install it from https://cli.github.com"
  command -v bun >/dev/null 2>&1 || die "bun is required (used to read/write package.json); see https://bun.sh"
  gh auth status >/dev/null 2>&1 || die "gh is not authenticated; run 'gh auth login'"

  local default_branch current_branch
  default_branch="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@' || true)"
  default_branch="${default_branch:-main}"
  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  [[ "$current_branch" == "$default_branch" ]] || die "must release from '$default_branch' (currently on '$current_branch')"
  [[ -z "$(git status --porcelain)" ]] || die "working tree is not clean; commit or stash changes first"

  [[ -f "$pkg" ]] || die "$pkg not found"
  [[ -f "$changelog" ]] || die "$changelog not found"

  # --- Resolve version -----------------------------------------------------

  local current_version next_version tag today
  current_version="$(read_pkg_version "$pkg")"
  [[ -n "$current_version" ]] || die "could not read version from $pkg"
  next_version="$(bump_version "$current_version" "$bump")" || die "invalid version/bump: $bump"
  tag="v${next_version}"
  today="$(date +%F)"

  git rev-parse "$tag" >/dev/null 2>&1 && die "tag $tag already exists (delete it to redo, or if only the GitHub release is missing run: gh release create $tag)"

  # --- Decide changelog action + release notes -----------------------------

  local unreleased_body existing_body rewrite_changelog notes_body release_notes new_changelog
  unreleased_body="$(section_body "## [Unreleased]" <"$changelog")"
  existing_body="$(section_body "## [${next_version}]" <"$changelog")"

  if has_content "$existing_body"; then
    # A section for this version already exists (e.g. the backfilled first
    # release): reuse its body as notes, do not insert a duplicate header.
    rewrite_changelog=false
    notes_body="$existing_body"
    if has_content "$unreleased_body"; then
      echo "note: [Unreleased] has entries but ## [$next_version] already exists;" \
        "leaving [Unreleased] untouched for the next release." >&2
    fi
  else
    if ! has_content "$unreleased_body" && [[ "$allow_empty" != true ]]; then
      die "[Unreleased] section is empty; add changelog entries or pass --allow-empty"
    fi
    rewrite_changelog=true
    notes_body="$unreleased_body"
  fi
  release_notes="$(printf '%s\n' "$notes_body" | strip_blank_lines)"
  [[ -n "$release_notes" ]] || release_notes="Release $tag"

  if [[ "$rewrite_changelog" == true ]]; then
    new_changelog="$(insert_release_section "$next_version" "$today" <"$changelog")"
  fi

  local bump_pkg=false
  [[ "$current_version" != "$next_version" ]] && bump_pkg=true

  echo "Releasing $current_version -> $next_version  (tag $tag, $today)"

  # --- Dry run -------------------------------------------------------------

  if [[ "$dry_run" == true ]]; then
    echo
    echo "--- DRY RUN; no changes will be made ---"
    echo
    if [[ "$bump_pkg" == true ]]; then
      echo "package.json: version $current_version -> $next_version"
    else
      echo "package.json: already at $next_version (no change)"
    fi
    echo
    if [[ "$rewrite_changelog" == true ]]; then
      echo "CHANGELOG.md after rewrite (top):"
      printf '%s\n' "$new_changelog" | sed -n '1,30p'
    else
      echo "CHANGELOG.md: ## [$next_version] already present (no change)"
    fi
    echo
    echo "git commit -m 'chore(release): $tag'  (only if package.json/CHANGELOG changed)"
    echo "git tag -a $tag -m $tag"
    echo "git push origin $default_branch --follow-tags"
    echo
    echo "gh release create $tag --title $tag --notes <<<"
    echo "$release_notes"
    return 0
  fi

  # --- Apply ---------------------------------------------------------------

  if [[ "$bump_pkg" == true ]]; then
    write_pkg_version "$pkg" "$next_version"
    git add "$pkg"
  fi
  if [[ "$rewrite_changelog" == true ]]; then
    printf '%s\n' "$new_changelog" >"$changelog"
    git add "$changelog"
  fi

  # Only commit when the release actually changed tracked files; the first
  # release of an already-backfilled version just tags the current commit.
  if ! git diff --cached --quiet; then
    git commit -m "chore(release): $tag"
  fi

  # Annotated tag (carries a message and is GPG-signed when the user has tag
  # signing enabled); a lightweight tag would be rejected under tag.gpgsign.
  git tag -a "$tag" -m "$tag"
  git push origin "$default_branch" --follow-tags

  # The commit and tag are now pushed; if only the release object fails to
  # create, the release can be finished without redoing any of the above.
  if ! gh release create "$tag" --title "$tag" --notes "$release_notes"; then
    die "tag $tag was committed and pushed, but 'gh release create' failed.
Once resolved, finish the release with:
  gh release create $tag --title $tag --notes '<the $tag section of CHANGELOG.md>'"
  fi

  echo "Released $tag"
}

# Run main only when executed directly, not when sourced by the test suite.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
