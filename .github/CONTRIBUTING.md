# Contributing to Company Brain

- [Report a bug](https://github.com/kombohq/company-brain/issues/new?labels=bug)
- [Propose a feature](https://github.com/kombohq/company-brain/issues/new?labels=enhancement)
- [Open a pull request](https://github.com/kombohq/company-brain/pulls)

For bigger changes, open an issue first so we can discuss.

## Understanding the Codebase

```
src/connectors/<source>/   → one connector per data source, entry point sync.ts
src/lib/                   → shared helpers
context/<source>/          → synced output (committed, agents read from here)
.github/                   → per-source sync action + scheduled workflow
.agents/skills/            → skills for common tasks
```

See [AGENTS.md](../AGENTS.md) for a fuller overview.

## Quick Start

Requires **Bun**.

```bash
bun install
```

## Making Changes

1. Branch from `main` (prefixes: `feat/`, `fix/`, `ref/`, `docs/`)
2. Make your change and verify it locally — run the same checks CI does:

   ```bash
   bun test          # run the test suite
   bun run typecheck # tsc --noEmit
   bun run lint      # oxlint
   bun run format    # prettier --write (or format:check to only verify)
   ```

   Run a single test file with `bun test path/to/file.test.ts`, or
   `bun test --watch` while iterating.

3. Add or update tests for new logic or behaviour changes (pure refactors don't need new tests, but the suite must still pass)
4. Open a PR

Tests live next to the code as `*.test.ts` and run on [Bun's test runner](https://bun.sh/docs/cli/test). Test observable behaviour, not implementation details — the connector `sync.test.ts` files are end-to-end examples: they stub only the network and assert on the files a sync produces.

## Adding a Connector

Read the skill at `.agents/skills/add-connector/SKILL.md` — it walks through the full pattern.

The canonical connector templates live at [kombohq/company-brain/src/connectors/](https://github.com/kombohq/company-brain/tree/main/src/connectors/).

## Commit Messages

We use [conventional commits](https://www.conventionalcommits.org/):

```
feat: add linear connector
fix: handle missing notion token gracefully
ref: simplify web connector pagination
docs: update getting started guide
```

---

[Code of Conduct](CODE_OF_CONDUCT.md) · [MIT License](../LICENSE)
