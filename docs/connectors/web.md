# Web connector

Mirrors web content (a marketing site, docs, a help center, ...) into the context as one Markdown file per page. Frontmatter records the source URL; the body is the page's main content. The start URL can be a page or a sitemap (`…/sitemap.xml`, including sitemap indexes); both are crawled breadth-first within the host. An optional regex restricts which paths are synced, and pages that disappear upstream are pruned, with a guardrail that skips pruning when a run discovers nothing.

Output: `context/<host>/`

## Running

```bash
WEB_URL=https://docs.example.com bun run web:sync
WEB_URL=https://example.com WEB_INCLUDE='^/docs/' bun run web:sync
WEB_URL=https://example.com/sitemap.xml WEB_OUT_DIR=context/example bun run web:sync
```

The reusable `./.github/actions/sync-web` action syncs one source per step. To mirror several sources, add more steps to `.github/workflows/sync-web.yml` or copy the workflow, each pointing at a different URL and directory.

CI: `.github/workflows/sync-web.yml` — uncomment the `schedule:` block to enable automatic syncs.
