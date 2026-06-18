# Granola connector

Mirrors Granola meeting notes into `context/granola/` as one Markdown file per note. Frontmatter holds `granola_id`, `title`, `created_at`, `updated_at`, `web_url`, `owner`, `attendees`, `folders`, and `calendar_event`. The body contains the full transcript (with speaker labels where available). Syncs are incremental (only notes whose `updated_at` changed are refetched) and prune notes removed from the API, with a guardrail that skips pruning when a run discovers nothing.

Output: `context/granola/`

## Setup

1. Open the Granola desktop app and go to **Settings → Connectors → API keys**.
2. Create a new key with the **Personal notes** and/or **Public notes** scope (Business or Enterprise plan required).
3. Put the key in `.env` as `GRANOLA_API_KEY` (local) and as a repo secret `GRANOLA_API_KEY` (for CI).

Optional env vars:

| Variable          | Default           | Description                                                                                         |
| ----------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `GRANOLA_OUT_DIR` | `context/granola` | Override the output directory. Useful when syncing multiple Granola accounts into separate folders. |

## Running

```bash
bun run granola:sync
```

CI: `.github/workflows/sync-granola.yml` — uncomment the `schedule:` block to enable automatic daily syncs.
