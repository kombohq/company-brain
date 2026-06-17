# Company Brain Template

This repository is a template for a company brain that you can get up and running in less than 20 minutes and use _without any new services or providers_. This runs entirely on the tools you already use.

**[Get started →](docs/getting-started.md)**

### Appraoch

Use this repository as a template and manage it in your own GitHub organization or in your private GitHub account. The repository synchronizes data from the tools that you use as markdown files into this repository, so you can have a coding agent navigate the files and do knowledge work for you.

The idea is simple: instead of giving an agent a pile of MCP servers and hoping it searches them well, you **pull the data into the repo as Markdown + JSON** and let the agent do what it's good at, reading files, running `grep`, and following links. It scales to thousands of files, finds far more relevant context, and is easy to inspect and reason about.

### Benefits

The approach that this takes is deliberately simple, and that's what makes it powerful.

- No new service needed. It only uses the tools you already use (Cursor/Claude and GitHub).
- Get your own company brain up and running in under 20 minutes.
- The files are the source of truth. No database schema to manage: your main branch is the source of truth, changing the way you sync data takes no effort.

## How it works

- Each **data source** has a small sync script under `src/connectors/<source>/` that fetches data and writes it into `context/<source>/` as raw JSON next to agent-friendly Markdown.
- A **GitHub Actions** workflow runs each sync on a schedule and commits the result back to the repo.
- An AI agent reads `AGENTS.md` and the skills under `.agents/skills/` to learn what's in the repo and how to search it.

Everything runs on [Bun](https://bun.sh). TypeScript scripts, no build step.

## Setup

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
- [Git repository](docs/connectors/repo.md)
- [Web crawler](docs/connectors/web.md)
- [Zendesk Help Center](docs/connectors/zendesk.md)

## Further reading

- [Running with Cursor Cloud Agents](docs/cursor-cloud-agents.md)

## License

[MIT](LICENSE)
