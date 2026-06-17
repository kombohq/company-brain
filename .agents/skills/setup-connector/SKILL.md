---
name: setup-connector
description: >-
  Enable and configure an existing connector. Use when the user wants to start
  syncing a data source that already has a connector (Notion, web, repo,
  Zendesk), set up credentials, enable the CI schedule, or customize filtering
  and output for an existing connector.
---

# Set up an existing connector

This skill covers **enabling a connector that already exists** in `src/connectors/`. To build a connector for a new data source, use the `add-connector` skill instead.

## 1. Identify the connector

Check `src/connectors/` to see which connectors are available in this repo. Also check the canonical template at https://github.com/kombohq/company-brain/tree/main/src/connectors/ - a newer connector for the data source the user wants may already exist there and can be pulled in before building anything from scratch.

## 2. Find the required credentials

Read `.env.example` for the connector's env vars. Each var has a comment pointing to where credentials are created and what permissions are needed.

Copy `.env.example` to `.env`. Ask the user for the credential values.

## 3. Add GitHub Actions secrets

The same values that go in `.env` need to be added as repository secrets so CI can use them.

Find the exact secret names in `.github/workflows/sync-<source>.yml` - look for `${{ secrets.* }}` references.

Direct the user to: `https://github.com/<owner>/<repo>/settings/secrets/actions`

## 4. Configure the CI workflow

The workflow files under `.github/workflows/` are templates. Before enabling them:

**Rename and describe the workflow.** Update the `name:` field at the top to reflect what it actually syncs (e.g. `Sync Public docs` instead of `Sync Web`). This makes the Actions tab readable when multiple workflows are running.

**Enable the schedule.** Uncomment the `schedule:` block and set a cron expression that fits how often the source changes (times are UTC).

**Stagger schedules across connectors.** When multiple workflows run at the same time, the commit-and-push step serializes via rebase, adding latency and noise. Spread cron times.

**Duplicate for multiple instances.** If the same connector should sync more than one source (e.g. two different repos, or two Zendesk subdomains), copy the workflow file and give each copy its own name, concurrency group, and schedule slot. Each step inside can target a different secret and output directory.

Commit and push the workflow changes.

## 5. Run locally to verify

Before relying on CI, do a local smoke run:

```bash
bun run <source>:sync
```

If `CONTEXT_ROOT=context-dev` is set in `.env`, output lands in `context-dev/<source>/` instead of `context/<source>/` - that's expected for local runs.

Read a sample of the synced files and verify they look right: frontmatter fields are populated, content is readable, links resolve, and there's no obviously missing or garbled data. Fix any credential or config errors before moving on.

## 6. Verify CI works

Ask the user to push the changes to GitHub and then trigger the workflow manually from the Actions tab (`Run workflow`). Wait for them to confirm it completed, then ask whether it succeeded and whether a new commit appeared on `main` with the synced files.

## 7. Update AGENTS.md

After a successful sync, launch a sub-agent to explore the synced folder before writing anything. Give it this task:

> Explore `context/<source>/`. Understand the folder structure, what kinds of files were created, and how they're named. Read a representative sample of files and note: what frontmatter fields are present and which ones are useful for filtering or identifying records (e.g. `status`, `id`, `url`, `tags`), what the typical file structure looks like, which files or subdirectories look most important, and whether there are any useful glob patterns for targeting specific subsets. Then summarize what's in there and what navigation hints would help an agent work with this folder effectively.

Based on the sub-agent's findings, draft a proposed AGENTS.md entry and present it to the user for review. Ask if anything should be added, changed, or removed.

Then write the AGENTS.md entry based on both the sub-agent's findings and the user's input. A good entry names the folder, what it contains, and agent-facing navigation hints:

```
- `context/notion/` — internal wiki: product specs, runbooks, decision logs
  - `path/to/some/page.md` — important product context
- `context/acme-api.zendesk.com/` — Help Center articles; useful for answering support questions
- `context/customers/` — one file per customer, joined from CRM + support tickets
```

Keep descriptions agent-facing: tell the agent what it will find there and when it's useful, not just what the connector does.

## 8. Optional, later down the line: customize the connector

Read `src/connectors/<source>/sync.ts` to understand what it currently does, then suggest the appropriate customization:

**Filter** - skip items that aren't relevant. Add an early `continue` in the loop or a `.filter()` on the list, keyed on a property, status, or date. Example: only sync Notion pages where a `Status` property equals `Published`.

**Schedule window** - for incremental connectors, limit the fetch to recent items using an env var like `CREATED_AFTER_ISO`. Useful for high-volume sources where fetching everything on every run is slow.

**Derived fields** - compute extra frontmatter fields from the raw data. Example: extract a customer name from a ticket subject, or derive a `priority` field from labels.

**Crosslinks** - when writing Markdown, add relative paths to related files already in `context/`. Example: in a ticket file, add a link to `../customers/<id>.md`. This lets an agent navigate between resources without searching.

**LLM enrichment** - after syncing raw data, run a convert step (for example with Cursor Automations) to classify, summarize, or extract structured information and push it to other places.

If the customization involves joining another data source or adding a separate convert step, switch to the `add-connector` skill which covers the full pattern.
