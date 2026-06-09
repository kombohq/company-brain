# company-brain

A long-term **sync hub** that checks your company's data sources into Git as plain, searchable files, so an AI agent (e.g. a Cursor agent) has durable, greppable context about your business.

The idea is simple: instead of giving an agent a pile of MCP servers and hoping it searches them well, you **pull the data into the repo as Markdown + JSON** and let the agent do what it's good at, reading files, running `grep`, and following links. It scales to hundreds of files, finds far more relevant context, and is easy to inspect and reason about.

## How it works

- Each **data source** has a small sync script under `src/<source>/` that fetches data and writes it into a top-level folder as raw JSON next to agent-friendly Markdown.
- A **GitHub Actions** workflow runs each sync on a schedule and commits the result back to the repo.
- A Cursor agent reads `.cursor/rules/` and `.cursor/skills/` to learn what's in the repo and how to search it.

Everything runs on [Bun](https://bun.sh). TypeScript scripts, no build step.

## Setup

```bash
# Install Bun if you haven't: https://bun.sh
bun install

# Type-check the scripts
bun run typecheck
```

Copy `.env.example` to `.env` and fill in the credentials for the sources you enable. Bun loads `.env` from the project root automatically.

## Data sources

_None yet. Sources are added one at a time; each adds its own folder, sync script, schedule, and setup notes here._

## Adding a new source

See `.cursor/skills/extend-agent-context/SKILL.md` for the pattern (where code goes, naming, the commit-and-push action, and the checklist for wiring a new source into CI).

## License

[MIT](LICENSE)
