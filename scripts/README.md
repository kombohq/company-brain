# scripts

Maintainer tooling for this repo.

## Files

- `release.sh` — cut a release: bump the version, roll `CHANGELOG.md`'s
  `[Unreleased]` section into a dated version section, commit, tag, push, and
  create the GitHub release. Split into pure helper functions (unit-tested) and
  a `main()` that wires them to `git`/`gh`.
- `release_test.sh` — [bashunit](https://bashunit.com) unit tests for
  `release.sh`'s pure helpers.
- `release_integration_test.sh` — bashunit tests that run `release.sh`
  end-to-end against a throwaway git repo with a stubbed `gh`, covering the
  decision paths and side effects (commit, tag, push, release notes).

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
`--allow-empty` to release when `[Unreleased]` has no entries. The release
commit and tag are GPG-signed when you have `commit.gpgsign` / `tag.gpgsign`
enabled.

Keep `[Unreleased]` current as you work — see the `update-changelog` skill.

## Recovery

The script does the irreversible steps last (commit, then tag, then push, then
`gh release create`), so a failure is easy to finish by hand:

- **`gh release create` failed** (commit and tag already pushed): re-create just
  the release with the version's CHANGELOG section as the notes. The script
  prints the exact `gh release create` command to run on failure.
- **Want to redo a release**: delete the tag locally and on the remote
  (`git tag -d vX.Y.Z && git push origin :vX.Y.Z`), then re-run. Re-running
  without deleting aborts with "tag already exists".

## Running the tests

```bash
bun run test:sh            # runs bashunit over this directory
```

`bashunit` is a dev dependency, so `bun install` provides it; CI runs the same
command. Tests source `release.sh` (which only defines functions when sourced)
and exercise the pure helpers in isolation, with no `git`/`gh` side effects.
Add a `test_*` function to `release_test.sh` for new behavior.
