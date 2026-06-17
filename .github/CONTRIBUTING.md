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
2. Make your change and verify it locally
3. Open a PR

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
