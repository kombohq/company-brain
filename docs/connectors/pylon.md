# Pylon connector

Mirrors **closed** Pylon support tickets and their accounts into the context:

- `tickets/<created-date>-TICKET-<number>.md` — one file per closed ticket. Frontmatter holds the metadata (`pylon_id`, `number`, `title`, `state`, `type`, timestamps, response/resolution metrics `first_response_*`/`resolution_*`/`number_of_touches`, `time_in_status_seconds`, `csat_score`/`csat_comment`, `source`, `slack`, `tags`, `requester`, `assignee_id`, `account_id`/`account`/`account_file`, `link`, any `custom_fields`); the body is the description and full conversation as Markdown, with a link to the account.
- `accounts/<slug>-<id>.md` — one file per account (name, domain, type, `external_ids`, timestamps) listing the synced tickets that reference it.

Ticket syncs are incremental on `updated_at`: only new or changed tickets have their messages refetched, and closed tickets aren't pruned. Accounts are fully refetched each run and pruned when they disappear upstream.

Output: `context/pylon/`

## Setup

1. Create an API token at <https://app.usepylon.com/settings/api-tokens> with read access to issues and messages.
2. Put it in `.env` as `PYLON_API_TOKEN` (local) and as a repo secret `PYLON_API_TOKEN` (for CI).

Optional env vars:

| Variable              | Default         | Description                                                                                                                                                                     |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PYLON_CREATED_AFTER` | _(all tickets)_ | Only sync tickets created after this date (e.g. `2025-01-01` or a full RFC3339 timestamp). Useful for high-volume workspaces where syncing everything on the first run is slow. |
| `PYLON_OUT_DIR`       | `context/pylon` | Override the output directory. Useful when syncing multiple Pylon workspaces into separate folders.                                                                             |

## Running

```bash
bun run pylon:sync
```

To force a full refetch of all ticket content, delete `context/pylon/tickets/` and re-run.

CI: `.github/workflows/sync-pylon.yml` — uncomment the `schedule:` block to enable automatic syncs.
