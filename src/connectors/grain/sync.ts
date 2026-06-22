/**
 * Mirror Grain recordings into context/grain/ as one markdown file per recording
 * (frontmatter holds grain_id, title, participants, teams, meeting_type,
 * calendar_event, hubspot; body holds the full transcript).
 *
 * All recordings are listed every run. Transcripts never change, so a recording
 * already on disk is left untouched (no transcript re-fetch); only new ones are
 * fetched and written. Recordings that disappear upstream, or that are filtered
 * out by shouldSync() / the cutoff date, are pruned, with a guardrail that skips
 * pruning when the API lists nothing so a transient outage can't wipe the mirror.
 *
 * Configured through env vars:
 *   GRAIN_API_KEY   required; Personal Access Token from
 *                   https://grain.com/app/settings/integrations?tab=api
 *   GRAIN_OUT_DIR   directory to mirror into (optional; defaults to context/grain)
 *   GRAIN_AFTER     only sync recordings whose start_datetime is on/after this
 *                   ISO date (optional; handy to keep dev runs small)
 *
 * Choose which recordings to keep by editing shouldSync() in options.ts.
 *
 * Usage:
 *   bun run grain:sync       mirror recordings into context/grain
 *   bun run grain:preview    list recordings and show what the filter
 *                            includes/excludes, without fetching transcripts
 */

import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { processParallel } from "../../lib/process-parallel.js";
import { GrainClient } from "./client.js";
import { getGrainConfig } from "./config.js";
import { recordingFilename, scanDisk } from "./disk.js";
import { keepRecording } from "./filter.js";
import { serializeRecording } from "./markdown.js";
import { previewGrain } from "./preview.js";

const FETCH_CONCURRENCY = 3;

async function syncGrain(): Promise<void> {
  const { apiKey, outDir, afterMs, afterIso } = getGrainConfig();
  const startedAt = Date.now();

  await mkdir(outDir, { recursive: true });
  const disk = await scanDisk(outDir);
  console.log(`${disk.size} recording(s) already on disk.`);

  const client = new GrainClient(apiKey);

  console.log(
    afterIso
      ? `Listing recordings from Grain API (since ${afterIso})...`
      : "Listing recordings from Grain API...",
  );

  const keep = new Set<string>();
  let listed = 0;
  let written = 0;

  await processParallel({
    concurrency: FETCH_CONCURRENCY,
    data: client.listRecordings(afterIso ?? undefined),
    fn: async (recording) => {
      listed += 1;
      if (listed % 100 === 0) {
        console.log(`  listed ${listed}...`);
      }

      if (!keepRecording(recording, afterMs)) {
        return;
      }

      keep.add(recording.id);
      if (disk.has(recording.id)) {
        return;
      }

      const transcript = await client.getTranscript(recording.id);
      const dest = join(outDir, recordingFilename(recording));
      await writeFile(dest, serializeRecording(recording, transcript), "utf-8");
      written += 1;
      if (written % 10 === 0) {
        console.log(`  fetched ${written} transcript(s)...`);
      }
    },
  });
  console.log(`Listed ${listed} recording(s); kept ${keep.size}.`);

  let deleted = 0;
  if (listed === 0) {
    console.warn("Listed 0 recordings; skipping prune to avoid data loss.");
  } else {
    for (const [id, path] of disk) {
      if (!keep.has(id)) {
        await rm(path, { force: true });
        deleted += 1;
      }
    }
  }

  const elapsedS = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `Done in ${elapsedS}s. Kept ${keep.size} recording(s); wrote ${written}, deleted ${deleted}.`,
  );
}

const run = process.argv.includes("--preview") ? previewGrain : syncGrain;
run().catch((err) => {
  console.error("Grain sync failed:", err);
  process.exit(1);
});
