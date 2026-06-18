---
name: update-changelog
description: >-
  Add a CHANGELOG.md entry for a user-facing change. Use after implementing a
  feature or bug fix, when finishing a PR, or whenever a change is worth
  recording, to append a terse bullet under the [Unreleased] section.
---

# Update the changelog

This repo keeps a human-scannable `CHANGELOG.md` at the repo root
([Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format). Every
user-facing change records a terse bullet under `## [Unreleased]` so a release
can be cut at any time from accumulated entries.

## When to add an entry

- **Add one for:** a new feature, a behavior change, a bug fix, a removed
  feature, or anything a user of this repo would notice.
- **Skip:** pure internal churn (refactors, formatting, test-only changes, dep
  bumps) unless it's notable enough that someone would want to know.

When in doubt, add a short bullet. A missing entry is worse than a small one.

## How to add it

Edit `CHANGELOG.md` directly. Put the bullet under `## [Unreleased]`, in the
right group, creating the `###` subheading if it isn't there yet:

- `### Added` — new features
- `### Changed` — changes to existing behavior
- `### Fixed` — bug fixes
- `### Removed` — removed features

### Style

- One terse bullet, imperative mood, matching the brevity of existing entries.
- No version number and no date — those are filled in at release time.
- Name the connector/area when it helps, e.g. `Slack connector: sync channel history`.

### Example

Before:

```markdown
## [Unreleased]

## [1.0.0] - 2026-06-18
```

After adding a new connector:

```markdown
## [Unreleased]

### Added

- Slack connector: sync channel history into `context/`

## [1.0.0] - 2026-06-18
```

## Releasing

`scripts/release.sh` (run via `bun run release`) consumes everything under
`## [Unreleased]` at release time, rolling it into a dated version section and
opening a fresh empty `[Unreleased]`. Keeping `[Unreleased]` current as you work
is what makes the next release accurate, so add the bullet in the same change
that introduces the feature or fix.
