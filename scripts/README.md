# scripts

Maintainer tooling.

## Files

- `release.sh`: cut a release (bump version, roll `CHANGELOG.md`'s
  `[Unreleased]` into a dated section, commit, tag, push, create the GitHub
  release).
- `tests/`: [bashunit](https://bashunit.com) tests for `release.sh` (pure-helper
  unit tests plus an end-to-end integration test against a throwaway repo).
- `harden-package-managers.sh`: run once to set a global minimum release age for
  bun / npm / pnpm / yarn as a supply-chain guard. See
  [security considerations](../docs/security.md#supply-chain-attacks).

## Cutting a release

From the default branch with a clean tree (needs authenticated `gh` and `bun`):

```bash
bun run release            # minor (default): 1.2.3 -> 1.3.0
bun run release patch      # 1.2.3 -> 1.2.4
bun run release major      # 1.2.3 -> 2.0.0
bun run release 2.1.0      # explicit version
bun run release --dry-run  # show the plan, change nothing
```

Keep `[Unreleased]` current as you work (see the `update-changelog` skill). A
section that already exists for the target version is reused as the notes; pass
`--allow-empty` to release with no `[Unreleased]` entries. The commit and tag are
signed when `commit.gpgsign` / `tag.gpgsign` are on.

If `gh release create` fails, the commit and tag are already pushed: re-run the
`gh release create` line it prints. To redo a release, delete the tag
(`git tag -d vX.Y.Z && git push origin :vX.Y.Z`) and run again.

## Tests

```bash
bun run test:sh            # bashunit over scripts/tests
```

`bashunit` is a dev dependency for local runs; CI runs the same tests in a
`shell-tests` job via the `TypedDevs/bashunit` action.
