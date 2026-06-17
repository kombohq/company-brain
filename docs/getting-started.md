# Getting Started

Work with a coding agent throughout. This repo has skills that teach agents how common tasks should be done - they don't need to figure things out from scratch. Point your agent at `.agents/skills/` when you need to add or configure a connector.

## Create your private repo

Click "Use this template" on [kombohq/company-brain](https://github.com/kombohq/company-brain) to create a fresh copy under your org with no commit history.

**Your repo must be private.** The auto-commit workflow refuses to run on public repos.

## Tell agents where to find connector templates

After forking, add this to your `AGENTS.md` so agents can fetch the latest connector code at runtime rather than guessing the pattern:

```
Before building a new connector from scratch, fetch the latest templates from the public template repo:
https://github.com/kombohq/company-brain/tree/main/src/connectors/
```

This lets an agent pull the most up-to-date connector code before starting, rather than reasoning from stale context.

## Enable your first connector

Use the **setup-connector** skill (`.agents/skills/setup-connector/`) with your coding agent. It walks through credentials, GitHub secrets, and enabling the CI schedule.

The short version:

1. Copy `.env.example` to `.env` and fill in the vars for the connector you want.
2. Add the same values as [Actions secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions) in your repo (`Settings → Secrets and variables → Actions`).
3. Uncomment the `schedule:` block in `.github/workflows/sync-<source>.yml`.
4. Run locally to verify: `bun run <source>:sync`

## Customize connectors

Connectors are TypeScript scripts - fork them freely. The four patterns to know:

**Filter** - only sync what's relevant. Example: skip Notion pages with a certain property value, or restrict the web crawler to a specific path prefix.

**Merge** - join data from multiple connectors in a post-processing script. A `customers:sync` script that joins a CRM export, support tickets, and call recordings into a single `customers/` folder is a common pattern.

**Crosslink** - when writing Markdown output, add relative links to related files already in `context/`. This lets an agent navigate between related resources without a search. For example, a customer file that links to every related support ticket.

**Infer** - use an LLM to enrich files: classify tickets by topic, score sales conversations, extract structured data from unstructured text. Add `@ai-sdk/anthropic` (or another provider) and call the model during the convert step after the raw data is synced.

For a production example of all four patterns together, look at `src/customers/sync.ts` in the [agent-context](https://github.com/kombohq/agent-context) repo - it joins BigQuery, a support tool, and call recordings into a unified customer view, with relative links to every attributed ticket and recording.

When the customization is substantial, work with your agent and point it at the `add-connector` skill, which covers the full pattern for code, CI, and documentation.

## Keep AGENTS.md current

As you add connectors, update `AGENTS.md` to describe what's in `context/` and what each folder contains. Agents read this file first to orient themselves. A good entry looks like:

```
- `context/notion/` — internal wiki: product specs, runbooks, decision logs
- `context/acme-api.zendesk.com/` — published Help Center articles
- `context/customers/` — one file per customer, joined from CRM + support tickets
```
