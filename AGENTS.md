# company-brain

A long-term **sync hub** that checks a company's data sources into Git as plain, searchable files, so an AI agent has durable, greppable context about the business. Data is pulled into the repo as Markdown + JSON; the agent reads files, greps, and follows links instead of querying live MCP servers.

Runs on [Bun](https://bun.sh): TypeScript, no build step.

## Layout

- `src/connectors/<source>/` — one connector per data source, entry point `sync.ts`. Existing: `notion`, `repo`.
- `src/lib/` — shared helpers
- `context/<source>/` — synced output, committed to the repo so agents have durable context.
- `.github/` — per-source sync action + scheduled workflow (adjust them to make it sync actual data)
