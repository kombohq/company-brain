#!/usr/bin/env bash
#
# Integration tests: drive release.sh's main() end-to-end against a throwaway
# git repo with a bare remote and a stubbed `gh`, covering the decision paths
# and the real side effects (version bump, annotated tag, push, release notes).
#
# Unlike release_test.sh (pure helpers), these execute the script as a
# subprocess, so they exercise the wiring: arg handling, preflight, the
# reuse-vs-rewrite-vs-abort branching, committing, tagging, and pushing.

REAL_RELEASE="$(cd "$(dirname "$BASH_SOURCE")/.." && pwd)/release.sh"

# Fresh sandbox per test: a bare "origin", a stubbed gh (logs its args to
# $GH_LOG; fails on `release create` when GH_FAIL_RELEASE=1), and a copy of the
# real release.sh under scripts/ so its "cd to repo root" lands in $WORK.
function set_up() {
  TMP="$(mktemp -d)"
  WORK="$TMP/work"
  GH_LOG="$TMP/gh.log"
  mkdir -p "$WORK/scripts" "$TMP/bin"
  cp "$REAL_RELEASE" "$WORK/scripts/release.sh"
  git init -q --bare "$TMP/origin.git"

  cat >"$TMP/bin/gh" <<EOF
#!/usr/bin/env bash
echo "\$*" >>"$GH_LOG"
[ "\$1" = "auth" ] && exit 0
if [ "\$1" = "release" ] && [ "\${GH_FAIL_RELEASE:-}" = "1" ]; then exit 1; fi
exit 0
EOF
  chmod +x "$TMP/bin/gh"
}

function tear_down() {
  rm -rf "$TMP"
}

# scaffold_repo <version> <changelog-body> — write package.json + CHANGELOG.md
# and create an initial commit pushed to origin (signing off so the test does
# not depend on a GPG key).
function scaffold_repo() {
  printf '{\n  "name": "demo",\n  "version": "%s"\n}\n' "$1" >"$WORK/package.json"
  printf '%s\n' "$2" >"$WORK/CHANGELOG.md"
  (
    cd "$WORK"
    git init -q -b main
    git config user.email test@example.com
    git config user.name "Test"
    git config commit.gpgsign false
    git config tag.gpgsign false
    git remote add origin "$TMP/origin.git"
    git add -A
    git commit -qm init
    git push -q -u origin main
    git remote set-head origin main
  )
}

# run_release <args...> — invoke the script with the gh stub on PATH.
function run_release() {
  PATH="$TMP/bin:$PATH" bash "$WORK/scripts/release.sh" "$@"
}

function remote_tags() { git --git-dir="$TMP/origin.git" tag; }
function changelog() { cat "$WORK/CHANGELOG.md"; }
function pkg_json() { cat "$WORK/package.json"; }

# --- normal release --------------------------------------------------------

function test_patch_release_bumps_rewrites_tags_and_publishes() {
  scaffold_repo "1.2.3" "# Changelog

## [Unreleased]

### Fixed

- A real bug fix"

  run_release patch >/dev/null 2>&1

  assert_contains '"version": "1.2.4"' "$(pkg_json)"
  assert_contains "## [1.2.4]" "$(changelog)"
  # annotated tag, pushed to origin
  assert_same "tag" "$(git -C "$WORK" cat-file -t "$(git -C "$WORK" rev-parse v1.2.4)")"
  assert_contains "v1.2.4" "$(remote_tags)"
  # GitHub release created with the [Unreleased] entry as notes
  assert_contains "release create v1.2.4" "$(cat "$GH_LOG")"
}

# --- existing section is reused, not duplicated ----------------------------

function test_existing_version_section_is_reused_without_duplication() {
  scaffold_repo "1.2.3" "# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-01

### Added

- Initial"

  run_release 1.0.0 >/dev/null 2>&1

  # exactly one 1.0.0 heading: no duplicate inserted
  assert_same "1" "$(grep -c '## \[1.0.0\]' "$WORK/CHANGELOG.md")"
  assert_contains '"version": "1.0.0"' "$(pkg_json)"
  assert_contains "v1.0.0" "$(remote_tags)"
}

# --- guards ----------------------------------------------------------------

function test_empty_unreleased_aborts_without_tagging() {
  scaffold_repo "1.2.3" "# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-01

### Added

- Initial"

  run_release minor >/dev/null 2>&1 && local rc=0 || local rc=1

  assert_same "1" "$rc"
  assert_empty "$(remote_tags)"
}

function test_allow_empty_releases_with_no_entries() {
  scaffold_repo "1.2.3" "# Changelog

## [Unreleased]"

  run_release minor --allow-empty >/dev/null 2>&1 && local rc=0 || local rc=1

  assert_same "0" "$rc"
  assert_contains "v1.3.0" "$(remote_tags)"
}

# --- dry run changes nothing ------------------------------------------------

function test_dry_run_makes_no_changes() {
  scaffold_repo "1.2.3" "# Changelog

## [Unreleased]

### Added

- Something"

  run_release patch --dry-run >/dev/null 2>&1

  assert_contains '"version": "1.2.3"' "$(pkg_json)"
  assert_empty "$(remote_tags)"
  assert_not_contains "release create" "$(cat "$GH_LOG")"
}

# --- partial failure leaves a recoverable state ----------------------------

function test_failed_release_creation_leaves_tag_pushed_for_recovery() {
  scaffold_repo "1.2.3" "# Changelog

## [Unreleased]

### Fixed

- A bug"

  local out
  out="$(GH_FAIL_RELEASE=1 PATH="$TMP/bin:$PATH" bash "$WORK/scripts/release.sh" patch 2>&1)" && local rc=0 || local rc=1

  assert_same "1" "$rc"
  # commit + tag + push all completed, so recovery is just re-creating the release
  assert_contains "v1.2.4" "$(remote_tags)"
  assert_contains "gh release create v1.2.4" "$out"
}
