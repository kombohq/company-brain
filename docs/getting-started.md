# Getting Started

Work with a coding agent throughout. This repo has skills that teach agents how common tasks should be done - they don't need to figure things out from scratch. Just ask your agent about the thing you want to do.

There are three steps to get started:

1. **[Set up the repository](#1-set-up-the-repository)** - create your private repo from this template.
2. **[Sync data](#2-sync-data)** - connect your tools and start pulling data into the repo (Recommended to start with Notion or Granola as it‘s usually the most powerful)
3. **[Wire it up to Slack](#3-wire-it-up-to-slack)** _(optional)_ - let your whole team query the company brain from Slack, without opening the coding agent UI.

---

## 1. Set up the repository

Click "Use this template" on [kombohq/company-brain](https://github.com/kombohq/company-brain) to create a fresh copy under your org with no commit history.

**Your repo must be private.** The auto-commit workflow refuses to run on public repos as a safety mechanism.

Clone the repo locally and run:

```bash
bun install
```

## 2. Sync data

Use the **setup-connector** skill (`.agents/skills/setup-connector/`) with your coding agent. It walks through credentials, GitHub secrets, and enabling the CI schedule.

The short version:

1. Copy `.env.example` to `.env` and fill in the vars for the connector you want.
2. Add the same values as [Actions secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions) in your repo (`Settings → Secrets and variables → Actions`).
3. Have the agent uncomment the `schedule:` block in `.github/workflows/sync-<source>.yml`.
4. Have the agent run it locally to verify: `bun run <source>:sync`

As you add connectors, have the agent update the `AGENTS.md` to describe what's in `context/` and what each folder contains. Agents read this file first to orient themselves. A good entry looks like:

```
- `context/notion/` — internal wiki: product specs, runbooks, decision logs
  - `path/to/some/page.md` -> important product context
- `context/acme-api.zendesk.com/` — find content on solving X from our helpcenter
- `context/customers/` — one file per customer, joined from CRM + support tickets
```

## 3. Wire it up to Slack

This step is optional. You can use the company brain directly in your coding agent UI without Slack. But connecting it to Slack makes it accessible to your whole team - anyone can ask a question in a channel without opening a coding environment.

For shared team access (anyone in the channel, no individual setup), use [Claude Tag](claude-tag.md) — Anthropic's shared `@Claude` teammate for Slack. It replaces the old per-user Claude in Slack app. If you're already on Cursor, the [Cursor Cloud Agents setup](cursor-cloud-agents.md) does the same thing.
