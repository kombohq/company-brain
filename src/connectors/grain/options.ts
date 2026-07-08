import type { Recording } from "./client.js";

/**
 * Decide which recordings get mirrored into context/. Return true to sync a
 * recording, false to skip it. The whole recording is available (title, source,
 * participants, teams, meeting_type, tags, datetimes), so express any allow/deny
 * logic you need right here.
 *
 * Tune this before the first real sync: run `bun run grain:preview` to print
 * what the current filter includes/excludes (no transcripts fetched), adjust,
 * and repeat.
 */
export function shouldSync(recording: Recording): boolean {
  // Examples (delete and replace with your own):
  //   return recording.participants.some((p) => p.scope === "external");
  //   return recording.meeting_type?.name === "Sales";
  //   return !recording.title.toLowerCase().includes("standup");
  void recording;
  return true;
}
