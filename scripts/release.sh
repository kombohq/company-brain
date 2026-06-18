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
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

pkg="package.json"
changelog="CHANGELOG.md"

bump="patch"
dry_run=false
allow_empty=false

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

die() {
  echo "error: $*" >&2
  exit 1
}

# --- Preflight -------------------------------------------------------------

command -v gh >/dev/null 2>&1 || die "gh CLI not found; install it from https://cli.github.com"
gh auth status >/dev/null 2>&1 || die "gh is not authenticated; run 'gh auth login'"

default_branch="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@' || true)"
default_branch="${default_branch:-main}"
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$default_branch" ]]; then
  die "must release from '$default_branch' (currently on '$current_branch')"
fi

if [[ -n "$(git status --porcelain)" ]]; then
  die "working tree is not clean; commit or stash changes first"
fi

[[ -f "$pkg" ]] || die "$pkg not found"
[[ -f "$changelog" ]] || die "$changelog not found"

# --- Resolve version -------------------------------------------------------

current_version="$(node -e "process.stdout.write(require('./package.json').version)")"
[[ -n "$current_version" ]] || die "could not read version from $pkg"

if [[ "$bump" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  next_version="$bump"
else
  IFS='.' read -r major minor patch <<<"$current_version"
  case "$bump" in
    major) next_version="$((major + 1)).0.0" ;;
    minor) next_version="${major}.$((minor + 1)).0" ;;
    patch) next_version="${major}.${minor}.$((patch + 1))" ;;
  esac
fi

tag="v${next_version}"
today="$(date +%F)"

git rev-parse "$tag" >/dev/null 2>&1 && die "tag $tag already exists"

# --- Guard: non-empty [Unreleased] ----------------------------------------

unreleased_body="$(
  awk '
    /^## \[Unreleased\]/ { capture = 1; next }
    /^## / && capture { exit }
    capture { print }
  ' "$changelog"
)"

if [[ -z "$(echo "$unreleased_body" | tr -d '[:space:]')" ]] && [[ "$allow_empty" != true ]]; then
  die "[Unreleased] section is empty; add changelog entries or pass --allow-empty"
fi

echo "Releasing $current_version -> $next_version  (tag $tag, $today)"

# --- Build the new changelog ----------------------------------------------

new_changelog="$(
  awk -v ver="$next_version" -v date="$today" '
    /^## \[Unreleased\]/ {
      print
      print ""
      print "## [" ver "] - " date
      next
    }
    { print }
  ' "$changelog"
)"

# Release notes = the body of the just-cut version section.
release_notes="$(echo "$unreleased_body" | sed '/^[[:space:]]*$/d')"
[[ -n "$release_notes" ]] || release_notes="Release $tag"

if [[ "$dry_run" == true ]]; then
  echo
  echo "--- DRY RUN; no changes will be made ---"
  echo
  echo "package.json: version $current_version -> $next_version"
  echo
  echo "CHANGELOG.md after rewrite (top):"
  echo "$new_changelog" | sed -n '1,30p'
  echo
  echo "git commit -m 'chore(release): $tag'"
  echo "git tag $tag"
  echo "git push origin $default_branch --follow-tags"
  echo
  echo "gh release create $tag --title $tag --notes <<<"
  echo "$release_notes"
  exit 0
fi

# --- Apply -----------------------------------------------------------------

node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('$pkg', 'utf8'));
  p.version = '$next_version';
  fs.writeFileSync('$pkg', JSON.stringify(p, null, 2) + '\n');
"

printf '%s\n' "$new_changelog" >"$changelog"

git add "$pkg" "$changelog"
git commit -m "chore(release): $tag"
git tag "$tag"
git push origin "$default_branch" --follow-tags

gh release create "$tag" --title "$tag" --notes "$release_notes"

echo "Released $tag"
