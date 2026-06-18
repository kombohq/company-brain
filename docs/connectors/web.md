# Web connector

Mirrors web content (a marketing site, docs, a help center, ...) into the context as one Markdown file per page. Frontmatter records the source URL; the body is the page's main content. The start URL can be a page or a sitemap (`…/sitemap.xml`, including sitemap indexes); both are crawled breadth-first within the host. An optional regex restricts which paths are synced, and pages that disappear upstream are pruned, with a guardrail that skips pruning when a run discovers nothing.

Output: `context/<host>/`

## Setup

No credentials required.

Required env vars:

| Variable  | Description                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `WEB_URL` | Start page or sitemap URL (e.g. `https://docs.example.com` or `https://example.com/sitemap.xml`). The host bounds the crawl. |

Optional env vars:

| Variable        | Default          | Description                                                                                                                                                   |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WEB_INCLUDE`   | _(all paths)_    | Regex to restrict which paths are synced (e.g. `^/docs/`).                                                                                                    |
| `WEB_MAX_PAGES` | `1000`           | Fail the run if more pages are discovered than this, rather than silently mirroring a partial subset. Raise it if your site legitimately exceeds the default. |
| `WEB_OUT_DIR`   | `context/<host>` | Override the output directory.                                                                                                                                |

## Running

```bash
WEB_URL=https://docs.example.com bun run web:sync
WEB_URL=https://example.com WEB_INCLUDE='^/docs/' bun run web:sync
WEB_URL=https://example.com/sitemap.xml WEB_OUT_DIR=context/example bun run web:sync
```

The reusable `./.github/actions/sync-web` action syncs one source per step. To mirror several sources, add more steps to `.github/workflows/sync-web.yml` or copy the workflow, each pointing at a different URL and directory. Replace the placeholder URLs in the template workflow with your own before enabling CI.

CI: `.github/workflows/sync-web.yml` — uncomment the `schedule:` block to enable automatic syncs.
