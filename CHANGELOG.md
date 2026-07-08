# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Connectors that sync into `context/`: Notion, web, repo, Zendesk, Pylon, Granola
- Reusable GitHub Actions + per-connector sync workflows (schedules opt-in)
- `commit-and-push` action with safety guards (refuses to commit `context/` on the public template repo)
- Skills: `add-connector`, `setup-connector`, `update-changelog`
- Changelog plus `bun run release` script (bashunit-tested) to cut tagged GitHub releases
- Shared libs: bounded-concurrency, paths (`CONTEXT_ROOT` dev override), markdown helpers
- CI: lint (oxlint), format check (prettier), typecheck, tests (`bun test`)
- Secret scanning (TruffleHog) and lefthook pre-commit hook (format + lint)
- e2e happy-path tests for the Zendesk and web connectors
- Docs: getting-started guide, per-connector docs, Claude Tag (recommended) and Cursor Cloud Agents guides for shared Slack access
- Docs: security considerations page, plus `harden-package-managers.sh` to set a global minimum release age (supply-chain guard)
- OSS community files (license, contributing scaffold)
