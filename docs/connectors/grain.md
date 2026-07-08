# Grain connector

Mirrors [Grain](https://grain.com) recordings into `context/grain/` as one Markdown file per recording. Frontmatter holds `grain_id`, `title`, `source`, `url`, `start_datetime`, `end_datetime`, `duration_ms`, `tags`, `teams`, `meeting_type`, `participants`, `calendar_event`, and `hubspot`. The body contains the full transcript with speaker labels.

All recordings are listed on every run. Transcripts never change, so a recording already on disk is left untouched and only new ones are fetched. Recordings that disappear upstream, or that are excluded by the filters below, are pruned, with a guardrail that skips pruning when the API lists nothing.

Output: `context/grain/`

## Setup

Both token types are created on the same page, **[Grain → Settings → Integrations → API](https://grain.com/app/settings/integrations?tab=api)**, and used identically as `GRAIN_API_KEY` (the connector just sends it as a bearer token). Pick one:

- **Personal Access Token (PAT)** — per-user. Inherits the same access as your own account ("Personal API"), so it only sees recordings you can see. Anyone can create one. Best for mirroring your own meetings.
- **Workspace Access Token (WAT)** — workspace-wide. Has access to **all data in the workspace**, regardless of who recorded it. Only users with the right permission can create one. Best for a complete, account-independent company mirror.

> The `attendance` and `private_notes` parameters are Personal API only, so they have no effect with a workspace token. This connector does not rely on them.

Then put the token in `.env` as `GRAIN_API_KEY` (local) and as a repo secret `GRAIN_API_KEY` (for CI).

3. **Set up filtering** (see below). A workspace token in particular can expose a lot of meetings; decide which ones belong in `context/` before the first sync.

Optional env vars:

| Variable        | Default         | Description                                                                                                                        |
| --------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GRAIN_OUT_DIR` | `context/grain` | Override the output directory. Useful when syncing multiple Grain accounts into separate folders.                                  |
| `GRAIN_AFTER`   | _(none)_        | Only sync recordings whose `start_datetime` is on/after this ISO date (e.g. `2026-06-01`). Great for keeping local dev runs small. |

## Filtering recordings

You almost always want to sync a subset of recordings, not everything. Edit `shouldSync()` in `src/connectors/grain/options.ts` and return `true` for recordings to keep. The whole recording is available, so express any logic you need:

```ts
export function shouldSync(recording: Recording): boolean {
  return recording.participants.some((p) => p.scope === "external"); // customer calls only
}
```

To dial it in without fetching any transcripts, preview what the current filter keeps vs skips:

```bash
bun run grain:preview
```

It prints one line per recording (date, source, meeting type, teams, title, participants) tagged `[ SYNC ]` or `[ SKIP ]` based purely on `shouldSync()` (not on what's already on disk), then a summary count. Iterate on `shouldSync()` until the preview looks right, then run the real sync. `GRAIN_AFTER` also applies to the preview, so you can scope it to a recent window.

## Running

```bash
bun run grain:sync
```

CI: `.github/workflows/sync-grain.yml` — uncomment the `schedule:` block to enable automatic daily syncs.
