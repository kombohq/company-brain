# Zendesk Help Center connector

Mirrors a Zendesk Help Center's published articles into the context as one Markdown file per article (`<article-id>.md`). YAML frontmatter holds the metadata (`zendesk_id`, `title`, `url`, `locale`, `section_id`, `labels`, timestamps); the body is the article content as Markdown. Uses the anonymous public API (no token required), reads only published articles (drafts are skipped), and prunes articles that were unpublished or deleted, with a guardrail that skips pruning when a run discovers nothing.

Output: `context/<subdomain>/`

## Setup

No credentials required.

Required env vars:

| Variable            | Description                               |
| ------------------- | ----------------------------------------- |
| `ZENDESK_SUBDOMAIN` | The `X` in `X.zendesk.com` (e.g. `acme`). |

Optional env vars:

| Variable          | Default               | Description                                                               |
| ----------------- | --------------------- | ------------------------------------------------------------------------- |
| `ZENDESK_LOCALE`  | `en-us`               | Guide locale to sync. Set to e.g. `de` to mirror a different language.    |
| `ZENDESK_OUT_DIR` | `context/<subdomain>` | Override the output directory. Useful when syncing multiple Help Centers. |

## Running

```bash
ZENDESK_SUBDOMAIN=acme bun run zendesk:sync
ZENDESK_SUBDOMAIN=acme ZENDESK_LOCALE=de bun run zendesk:sync
```

The reusable `./.github/actions/sync-zendesk` action syncs one Help Center per step. To mirror several, add more steps to `.github/workflows/sync-zendesk.yml` or copy the workflow, each pointing at a different subdomain and directory.

CI: `.github/workflows/sync-zendesk.yml` — uncomment the `schedule:` block to enable automatic syncs.
