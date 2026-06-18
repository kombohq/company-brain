# Notion connector

Mirrors the Notion pages and databases shared with an internal integration. Each node (page or database) becomes a folder with an `index.md`: YAML frontmatter holds the Notion metadata (`notion_id`, `title`, `last_edited_time`, author, `url`, normalized `properties`/`schema`), the body is the page content as Markdown. The on-disk tree mirrors the Notion hierarchy, and relations link to sibling files. Syncs are incremental (only pages whose `last_edited_time` changed are refetched) and prune pages that were unshared or deleted.

Output: `context/notion/`

## Setup

1. Create an internal integration at <https://www.notion.com/my-integrations> with the **Read content** and **Read user information including email addresses** capabilities.
2. Share the top-level pages/databases you want synced with the integration.
3. Put the token in `.env` as `NOTION_TOKEN` (local) and as a repo secret `NOTION_TOKEN` (for CI).

Optional env vars:

| Variable         | Default          | Description                                                                                                                                                                       |
| ---------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NOTION_OUT_DIR` | `context/notion` | Override the output directory. Useful when syncing multiple Notion integrations into separate folders — copy the workflow and point each step at a different token and directory. |

## Running

```bash
bun run notion:sync         # incremental
bun run notion:sync full    # ignore on-disk timestamps, refetch all
```

CI: `.github/workflows/sync-notion.yml` — uncomment the `schedule:` block to enable automatic daily syncs.
