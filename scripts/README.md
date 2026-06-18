# scripts

Maintainer tooling for this repo.

## Files

- `release.sh` — cut a release: bump the version, roll `CHANGELOG.md`'s
  `[Unreleased]` section into a dated version section, commit, tag, push, and
  create the GitHub release. Split into pure helper functions (unit-tested) and
  a `main()` that wires them to `git`/`gh`.
- `release_test.sh` — [bashunit](https://bashunit.com) tests for `release.sh`'s
  pure helpers.

## Cutting a release

Run from the default branch with a clean working tree:

```bash
bun run release            # patch bump (1.2.3 -> 1.2.4)
bun run release minor      # 1.2.3 -> 1.3.0
bun run release major      # 1.2.3 -> 2.0.0
bun run release 2.1.0      # explicit version
bun run release --dry-run  # print the plan without changing anything
```

Requires `gh` (authenticated) and `bun`. If `CHANGELOG.md` already has a section
for the target version (e.g. the backfilled first release), the script reuses
that section as the release notes instead of inserting a duplicate; pass
`--allow-empty` to release when `[Unreleased]` has no entries.

Keep `[Unreleased]` current as you work — see the `update-changelog` skill.

## Running the tests

```bash
bun run test:sh            # runs bashunit over this directory
```

`bashunit` is a dev dependency, so `bun install` provides it; CI runs the same
command. Tests source `release.sh` (which only defines functions when sourced)
and exercise the pure helpers in isolation, with no `git`/`gh` side effects.
Add a `test_*` function to `release_test.sh` for new behavior.
