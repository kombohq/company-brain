# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-06-18

### Added

- Connectors that sync into `context/`: Notion, web, repo, Zendesk, Pylon, Granola
- Reusable GitHub Actions + per-connector sync workflows (schedules opt-in)
- `commit-and-push` action with safety guards (refuses to commit `context/` on the public template repo)
- Skills: `add-connector`, `setup-connector`
- Shared libs: bounded-concurrency, paths (`CONTEXT_ROOT` dev override), markdown helpers
- CI: lint (oxlint), format check (prettier), typecheck, tests (`bun test`)
- Secret scanning (TruffleHog) and lefthook pre-commit hook (format + lint)
- e2e happy-path tests for the Zendesk and web connectors
- Docs: getting-started guide, per-connector docs, Cursor Cloud Agents and Claude Code on the web guides
- OSS community files (license, contributing scaffold)
