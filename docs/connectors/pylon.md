# Pylon connector

Mirrors **closed** Pylon support tickets and their accounts into the context:

- `tickets/<created-date>-TICKET-<number>.md` — one file per closed ticket. Frontmatter holds the metadata (`pylon_id`, `number`, `title`, `state`, `type`, timestamps, response/resolution metrics `first_response_*`/`resolution_*`/`number_of_touches`, `time_in_status_seconds`, `csat_score`/`csat_comment`, `source`, `slack`, `tags`, `requester`, `assignee_id`, `account_id`/`account`/`account_file`, `link`, any `custom_fields`); the body is the description and full conversation as Markdown, with a link to the account.
- `accounts/<slug>-<id>.md` — one file per account (name, domain, type, `external_ids`, timestamps) listing the synced tickets that reference it.

Ticket syncs are incremental on `updated_at`: only new or changed tickets have their messages refetched, and closed tickets aren't pruned. Accounts are fully refetched each run and pruned when they disappear upstream.

Output: `context/pylon/`

## Running

```bash
PYLON_API_TOKEN=... bun run pylon:sync              # incremental
PYLON_CREATED_AFTER=2026-06-14 bun run pylon:sync   # only tickets created after a date
```

Set `PYLON_CREATED_AFTER` (a date or RFC3339 timestamp) to only sync tickets created after it. To force a full refetch, delete `context/pylon/tickets/` and re-run.

## Setup

1. Create an API token at <https://app.usepylon.com/settings/api-tokens> with read access to issues and messages.
2. Put it in `.env` as `PYLON_API_TOKEN` (local) and as a repo secret `PYLON_API_TOKEN` (for CI).

CI: `.github/workflows/sync-pylon.yml` — uncomment the `schedule:` block to enable automatic syncs.
