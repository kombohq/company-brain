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

Existing connectors and their scripts:

| Source    | Script                 | Output                 |
| --------- | ---------------------- | ---------------------- |
| `notion`  | `bun run notion:sync`  | `context/notion/`      |
| `repo`    | `bun run repo:sync`    | `context/<name>/`      |
| `web`     | `bun run web:sync`     | `context/<host>/`      |
| `zendesk` | `bun run zendesk:sync` | `context/<subdomain>/` |

If the user hasn't specified a connector, ask which data source they want to enable.

## 2. Find the required credentials

Read `.env.example` for the connector's env vars. Each var has a comment pointing to where credentials are created and what permissions are needed.

Copy `.env.example` to `.env` (if it doesn't exist yet) and fill in the relevant vars. Ask the user for the credential values.

## 3. Add GitHub Actions secrets

The same values that go in `.env` need to be added as repository secrets so CI can use them.

Find the exact secret names in `.github/workflows/sync-<source>.yml` - look for `${{ secrets.* }}` references.

Direct the user to: `https://github.com/<owner>/<repo>/settings/secrets/actions`

## 4. Enable the CI schedule

Open `.github/workflows/sync-<source>.yml` and uncomment the `schedule:` block:

```yaml
on:
  schedule:
    - cron: "30 3 * * *" # uncomment this
  workflow_dispatch:
```

Adjust the cron expression if needed (times are UTC). Typical cadences:

- Fast-moving sources (tickets, Slack): every hour or every few hours
- Internal wikis (Notion): daily
- Rarely-changing sources (docs site, Help Center): weekly

Commit and push the workflow change.

## 5. Run locally to verify

Before relying on CI, do a local smoke run:

```bash
bun run <source>:sync
```

Check that files appear under `context/<source>/` and look correct. Fix any credential or config errors before enabling CI.

## 6. Optional: customize the connector

Read `src/connectors/<source>/sync.ts` to understand what it currently does, then suggest the appropriate customization:

**Filter** - skip items that aren't relevant. Add an early `continue` in the loop or a `.filter()` on the list, keyed on a property, status, or date. Example: only sync Notion pages where a `Status` property equals `Published`.

**Schedule window** - for incremental connectors, limit the fetch to recent items using an env var like `CREATED_AFTER_ISO`. Useful for high-volume sources where fetching everything on every run is slow.

**Derived fields** - compute extra frontmatter fields from the raw data. Example: extract a customer name from a ticket subject, or derive a `priority` field from labels.

**Crosslinks** - when writing Markdown, add relative paths to related files already in `context/`. Example: in a ticket file, add a link to `../customers/<id>.md`. This lets an agent navigate between resources without searching.

**LLM enrichment** - after syncing raw data, run a convert step that calls an LLM to classify, summarize, or extract structured information. Add `@ai-sdk/anthropic` (or another provider) and write a `convert.ts` script that reads the raw JSON and rewrites the Markdown.

If the customization involves joining another data source or adding a separate convert step, switch to the `add-connector` skill which covers the full pattern.
