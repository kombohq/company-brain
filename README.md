# Company Brain Template

This repository is a template for a company brain that you can get up and running in less than 20 minutes and use _without any new services or providers_. This runs entirely on the tools you already use.

**[Get started →](docs/getting-started.md)**

### Approach

Use this repository as a template and manage it in your own GitHub organization or in your private GitHub account. The repository synchronizes data from the tools that you use as markdown files into this repository, so you can have a coding agent navigate the files and do knowledge work for you.

The idea is simple: instead of giving an agent a pile of MCP servers and hoping it searches them well, you **pull the data into the repo as Markdown** and let the agent do what it's good at, reading files, running `grep`, and following links. It scales to thousands of files, finds far more relevant context, and is easy to inspect and reason about.

### Benefits

The approach that this takes is deliberately simple, and that's what makes it powerful.

- No new service needed. It only uses the tools you already use (Cursor/Claude and GitHub).
- Get your own company brain up and running in under 20 minutes.
- The files are the source of truth. No database schema to manage: your main branch is the source of truth, changing the way you sync data takes no effort.

## How to use this repo

What we do at Kombo:

**Filter** - only sync what's relevant. Skip noise so the agent isn't distracted by it.

**Merge** - join data from multiple sources in a post-processing script. A single `customers/` folder that combines CRM data, support tickets, and call recordings is more useful than three separate folders.

**Crosslink** - add relative links between related files so an agent can navigate between them without searching. A customer file that links to every related ticket; a ticket that links back to the customer.

**Infer** - use an LLM (e.g. in a Cursor Automation) to manage data on a recurring schedule: classify tickets, score conversations, extract structured data from unstructured text, or install MCPs to push tickets into Linear, manage TODOs from meetings, or similar.

For a production example, see `src/customers/sync.ts` in [kombohq/agent-context](https://github.com/kombohq/agent-context).

## How it works

- Each **data source** has a small sync script under `src/connectors/<source>/` that fetches data and writes it into `context/<source>/` as agent-friendly Markdown.
- A **GitHub Actions** workflow runs each sync and commits the result back to the repo. Schedules are opt-in: uncomment the `schedule:` block in the matching workflow file to enable automatic daily syncs.
- An AI agent reads `AGENTS.md` and the skills under `.agents/skills/` to learn what's in the repo and how to search it.

Everything runs on [Bun](https://bun.sh). TypeScript scripts, no build step.

## Setup

**Your repo must be private.** The auto-commit workflow refuses to run on public repos as a safety mechanism. Use "Use this template" on [kombohq/company-brain](https://github.com/kombohq/company-brain) to create a private copy.

```bash
# Install Bun if you haven't: https://bun.sh
bun install

# Type-check the scripts
bun run typecheck
```

Copy `.env.example` to `.env` and fill in the credentials for the sources you enable. Bun loads `.env` from the project root automatically.

## Connectors

All synced data lives under `context/<source>/`. Detailed setup instructions for each connector:

- [Notion](docs/connectors/notion.md)
- [Granola](docs/connectors/granola.md)
- [Git repository](docs/connectors/repo.md)
- [Web crawler](docs/connectors/web.md)
- [Zendesk Help Center](docs/connectors/zendesk.md)
- [Pylon](docs/connectors/pylon.md)

## Further reading

- [Running with Cursor Cloud Agents](docs/cursor-cloud-agents.md)

## Adding a new source

See `.agents/skills/add-connector/SKILL.md` for the pattern (where code goes, naming, the commit-and-push action, and the checklist for wiring a new source into CI). Skills live in `.agents/skills/` and are shared with each agent tool via a committed symlink (`.claude/skills`, `.codex/skills`, `.cursor/skills`).

## Local development

Set `CONTEXT_ROOT=context-dev` in your `.env` so sync output lands in a gitignored directory instead of the committed `context/` folder:

```bash
# .env
CONTEXT_ROOT=context-dev
```

All connectors pick this up automatically. Leave it unset in CI so production syncs go to `context/` as normal.

## License

[MIT](LICENSE)
