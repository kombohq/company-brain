---
name: add-connector
description: >-
  Add or change a connector that syncs a new data source into this repo's
  context. Use when the user wants to mirror another source (an API, a website,
  a database, a repo) into context/, add a sync script, wire package.json, or
  set up the CI workflow, following the existing Notion / website / repo
  connectors.
---

# Add a connector (sync a new data source)

This repo pulls **external data into `context/`** as plain files so an agent can grep, read, and follow links. This skill is about **adding the sync code**, not about answering questions from already-synced data.

## Principles

- **Bun only.** Scripts run with `bun run …`; no build step, no npm/pnpm/yarn.
- **Keep it lean.** Do the smallest thing that works. Add a dependency only when there's a concrete need, and never drag in tooling from other repos (no databases, queues, web frameworks) just because a similar connector elsewhere had them.
- **Raw + derived artifacts.** Persist the raw structured dump (JSON) next to an agent-friendly derivation (Markdown). Record the source id/url in frontmatter so files can be linked back and pruned.
- **Incremental and self-pruning.** Refetch only what changed; delete files whose source disappeared upstream. **But skip pruning when a run discovers nothing** so a transient outage can't wipe the mirror.
- **Bounded concurrency.** For list-then-detail jobs use `processParallel` from `src/lib/process-parallel.ts` with a fixed concurrency constant beside the code. No unbounded `Promise.all`, no accumulating huge in-memory arrays, fetch → write → release.
- **Minimal credentials.** Require the least-privileged token/scope, and say exactly how to create it.

## Where code goes

- One connector per directory: `src/connectors/<source>/`, entry point `sync.ts` (plus helpers like `discover.ts`, `markdown.ts` as needed).
- Output paths come from `contextDir(name)` in `src/lib/paths.ts` → `context/<name>/`.
- Configure the script through **env vars** read at the top of `sync.ts` (see `website/sync.ts` for the pattern: required vars throw, optional vars have defaults).

Look at the existing connectors before writing a new one:

- `src/connectors/notion/` — API mirror, incremental by `last_edited_time`, prunes unshared/deleted nodes.
- `src/connectors/website/` — crawl/sitemap → one Markdown file per page, prunes by source URL.
- `src/connectors/repo/` — shallow git clone of another repo, `.git` dropped.

## package.json

Add a script named **`<source>:sync`** that runs the entry point:

```json
"<source>:sync": "bun run src/connectors/<source>/sync.ts"
```

## CI wiring

Mirror the existing actions exactly:

1. **Reusable composite action** at `.github/actions/sync-<source>/action.yml`: `setup-bun` → `bun install --frozen-lockfile` → run the sync (passing secret + `directory` as env vars) → reuse `./.github/actions/commit-and-push`. Inputs are the **secret** and the **`directory`** to sync into, so the action can run multiple times for multiple instances.
2. **Workflow** at `.github/workflows/sync-<source>.yml`: `workflow_dispatch` plus a commented-out daily `schedule`, a `concurrency` group keyed on the repo + source, `permissions: contents: write`, and a comment explaining how to add another step / duplicate the file for more instances.
3. If a partial sync is still useful (e.g. an API timeout mid-run), follow Notion's `continue-on-error` + "surface failure after commit" pattern so written files still get committed.

## Checklist for a new connector

1. Pick the **`<source>`** name and its `context/<source>/` output directory.
2. Implement `src/connectors/<source>/sync.ts` with Bun; env-var config; `processParallel` for list-then-detail; incremental + safe prune.
3. Add the **`<source>:sync`** script to `package.json`.
4. Document the env vars in **`.env.example`** (with the minimal credential scope and where to create it).
5. Add the data-source section to **`README.md`** (setup steps, how to run, CI schedule).
6. Add the reusable action and workflow under `.github/`.
7. Verify before finishing: `bun run typecheck`, `bun run lint`, `bun run format`, and a quick local smoke run of the sync.
