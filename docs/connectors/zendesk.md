# Zendesk Help Center connector

Mirrors a Zendesk Help Center's published articles into the context as one Markdown file per article (`<article-id>.md`). YAML frontmatter holds the metadata (`zendesk_id`, `title`, `url`, `locale`, `section_id`, `labels`, timestamps); the body is the article content as Markdown. Uses the anonymous public API (no token required), reads only published articles (drafts are skipped), and prunes articles that were unpublished or deleted, with a guardrail that skips pruning when a run discovers nothing.

Output: `context/<subdomain>/`

## Running

```bash
ZENDESK_SUBDOMAIN=acme bun run zendesk:sync                    # mirror into context/acme
ZENDESK_SUBDOMAIN=acme ZENDESK_LOCALE=de bun run zendesk:sync  # a different Guide locale
```

`ZENDESK_SUBDOMAIN` is the `X` in `X.zendesk.com`.

The reusable `./.github/actions/sync-zendesk` action syncs one Help Center per step. To mirror several, add more steps to `.github/workflows/sync-zendesk.yml` or copy the workflow, each pointing at a different subdomain and directory.

CI: `.github/workflows/sync-zendesk.yml` — uncomment the `schedule:` block to enable automatic syncs.
