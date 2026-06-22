import { GrainClient, type Recording } from "./client.js";
import { getGrainConfig } from "./config.js";
import { keepRecording } from "./filter.js";

function previewLine(recording: Recording, keep: boolean): string {
  const tag = keep ? "[ SYNC ]" : "[ SKIP ]";
  const date = recording.start_datetime.slice(0, 10);
  const type = recording.meeting_type?.name ?? "-";
  const teams = recording.teams.map((t) => t.name).join("/") || "-";
  const participants =
    recording.participants
      .map((p) => `${p.scope}:${p.email ?? p.name}`)
      .join(", ") || "-";
  return `${tag} ${date} ${recording.source} | type=${type} | teams=${teams} | ${recording.title} | ${participants}`;
}

// Lists recordings and prints what shouldSync() keeps/skips, without fetching
// transcripts or writing files, so the filter can be tuned cheaply.
export async function previewGrain(): Promise<void> {
  const { apiKey, afterMs, afterIso } = getGrainConfig();
  const client = new GrainClient(apiKey);

  console.log(
    afterIso
      ? `Previewing recordings from Grain API (since ${afterIso})...\n`
      : "Previewing recordings from Grain API...\n",
  );

  let listed = 0;
  let kept = 0;
  for await (const recording of client.listRecordings(afterIso ?? undefined)) {
    listed += 1;
    const keep = keepRecording(recording, afterMs);
    if (keep) {
      kept += 1;
    }
    console.log(previewLine(recording, keep));
  }

  console.log(
    `\n${kept}/${listed} recording(s) would be synced (${listed - kept} skipped). Edit shouldSync() in options.ts to adjust.`,
  );
}
