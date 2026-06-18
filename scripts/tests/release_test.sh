#!/usr/bin/env bash
#
# Tests for the pure helpers in release.sh, run with bashunit:
#   bun run test:sh
#
# Sourcing release.sh defines its functions without executing main(), so each
# helper can be exercised in isolation with no git/gh side effects.

# shellcheck source=scripts/release.sh
source "$(dirname "$BASH_SOURCE")/../release.sh"

# A small changelog fixture: an empty [Unreleased] above a populated [1.0.0].
CHANGELOG_FIXTURE="# Changelog

## [Unreleased]

## [1.0.0] - 2026-06-18

### Added

- First feature
- Second feature"

# --- bump_version ----------------------------------------------------------

function test_bump_patch() {
  assert_same "1.2.4" "$(bump_version "1.2.3" patch)"
}

function test_bump_minor_resets_patch() {
  assert_same "1.3.0" "$(bump_version "1.2.3" minor)"
}

function test_bump_major_resets_minor_and_patch() {
  assert_same "2.0.0" "$(bump_version "1.2.3" major)"
}

function test_bump_explicit_version_is_used_verbatim() {
  assert_same "5.0.1" "$(bump_version "1.2.3" "5.0.1")"
}

function test_bump_rejects_garbage() {
  bump_version "1.2.3" nonsense && local rc=0 || local rc=1
  assert_same "1" "$rc"
}

# --- section_body ----------------------------------------------------------

function test_section_body_extracts_named_version() {
  local body
  body="$(echo "$CHANGELOG_FIXTURE" | section_body "## [1.0.0]")"
  assert_contains "First feature" "$body"
  assert_contains "Second feature" "$body"
}

function test_section_body_stops_at_next_heading() {
  # The [Unreleased] section is empty, so its body must not bleed into [1.0.0].
  local body
  body="$(echo "$CHANGELOG_FIXTURE" | section_body "## [Unreleased]")"
  assert_not_contains "First feature" "$body"
}

function test_section_body_missing_version_is_empty() {
  local body
  body="$(echo "$CHANGELOG_FIXTURE" | section_body "## [9.9.9]")"
  assert_empty "$(echo "$body" | tr -d '[:space:]')"
}

# --- has_content -----------------------------------------------------------

function test_has_content_true_for_text() {
  has_content "- a bullet" && local rc=0 || local rc=1
  assert_same "0" "$rc"
}

function test_has_content_false_for_whitespace() {
  has_content "$(printf ' \n\t ')" && local rc=0 || local rc=1
  assert_same "1" "$rc"
}

# --- insert_release_section ------------------------------------------------

# One assertion on the heading order covers all of: a fresh empty [Unreleased]
# stays on top, the new dated section is inserted directly below it, and the
# previous release section is left intact underneath.
function test_insert_release_section_heading_order() {
  local out headings
  out="$(echo "$CHANGELOG_FIXTURE" | insert_release_section "1.1.0" "2026-07-01")"
  headings="$(echo "$out" | grep '^## ' | tr '\n' '|')"
  assert_same "## [Unreleased]|## [1.1.0] - 2026-07-01|## [1.0.0] - 2026-06-18|" "$headings"
}

# --- strip_blank_lines -----------------------------------------------------

function test_strip_blank_lines_removes_empty_lines() {
  local out
  out="$(printf 'a\n\n  \nb\n' | strip_blank_lines)"
  assert_same "a
b" "$out"
}
