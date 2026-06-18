/**
 * Mirror Granola meeting notes into context/granola/ as one markdown file per note
 * (frontmatter holds granola_id, title, updated_at, web_url; body is the full transcript).
 *
 * Incremental: updated_at from the list endpoint is compared to what is stored in each
 * file's frontmatter; only new or changed notes get the more expensive per-note fetch.
 * Notes removed from the API are pruned, with a guardrail that skips pruning when a
 * run discovers nothing so a transient outage can't wipe the mirror.
 *
 * Configured through env vars:
 *   GRANOLA_API_KEY   required; create at Granola Settings → Connectors → API keys
 *                     (https://app.granola.ai) with Personal notes and/or Public notes
 *                     scope. Business or Enterprise plan required.
 *   GRANOLA_OUT_DIR   directory to mirror into (optional; defaults to context/granola)
 *
 * Usage:
 *   bun run granola:sync
 */

import { mkdir, readdir, readFile, rename, rm, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { processParallel } from "../../lib/process-parallel.js";
import { contextDir } from "../../lib/paths.js";
import { GranolaClient, type NoteSummary } from "./client.js";
import { idOf, serializeNote, updatedAtOf } from "./markdown.js";

const FETCH_CONCURRENCY = 3;

function noteFilename(summary: NoteSummary): string {
  return `${summary.created_at.slice(0, 10)}_${summary.id}.md`;
}

function config() {
  const apiKey = process.env.GRANOLA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GRANOLA_API_KEY is required");
  }
  const outDir = process.env.GRANOLA_OUT_DIR
    ? resolve(process.env.GRANOLA_OUT_DIR)
    : contextDir("granola");
  return { apiKey, outDir };
}

async function scanDisk(
  outDir: string,
): Promise<Map<string, { path: string; updatedAt: number | null }>> {
  const byId = new Map<string, { path: string; updatedAt: number | null }>();
  let entries;
  try {
    entries = await readdir(outDir, { withFileTypes: true });
  } catch {
    return byId;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const full = join(outDir, entry.name);
    const content = await readFile(full, "utf-8");
    const id = idOf(content);
    if (id !== null) {
      byId.set(id, { path: full, updatedAt: updatedAtOf(content) });
    }
  }
  return byId;
}

async function syncGranola(): Promise<void> {
  const { apiKey, outDir } = config();
  const startedAt = Date.now();

  await mkdir(outDir, { recursive: true });
  const disk = await scanDisk(outDir);
  console.log(`${disk.size} note(s) already on disk.`);

  const client = new GranolaClient(apiKey);

  console.log("Listing notes from Granola API...");
  const summaries: NoteSummary[] = [];
  for await (const s of client.listNotes()) {
    summaries.push(s);
  }
  summaries.sort((a, b) => b.created_at.localeCompare(a.created_at));
  console.log(
    `Found ${summaries.length} note(s). Fetching new/changed content...`,
  );

  const toFetch = summaries.filter((s) => {
    const onDisk = disk.get(s.id);
    const apiMs = new Date(s.updated_at).getTime();
    const dest = join(outDir, noteFilename(s));
    return onDisk?.updatedAt !== apiMs || (onDisk && onDisk.path !== dest);
  });
  console.log(
    `${toFetch.length} note(s) need updating (${summaries.length - toFetch.length} unchanged).`,
  );

  const seen = new Set<string>();
  let written = 0;
  let moved = 0;
  let processed = 0;
  const fetchTotal = toFetch.filter((s) => {
    const onDisk = disk.get(s.id);
    return onDisk?.updatedAt !== new Date(s.updated_at).getTime();
  }).length;

  await processParallel({
    concurrency: FETCH_CONCURRENCY,
    data: summaries,
    fn: async (summary) => {
      seen.add(summary.id);
      const onDisk = disk.get(summary.id);
      const dest = join(outDir, noteFilename(summary));
      const apiMs = new Date(summary.updated_at).getTime();
      const contentChanged = onDisk?.updatedAt !== apiMs;
      const pathChanged = onDisk !== undefined && onDisk.path !== dest;

      if (!contentChanged && !pathChanged) {
        return;
      }

      if (contentChanged) {
        const note = await client.getNote(summary.id);
        await writeFile(dest, serializeNote(note), "utf-8");
        written += 1;
        if (onDisk && pathChanged) {
          await rm(onDisk.path, { force: true });
        }
      } else {
        await rename(onDisk!.path, dest);
        moved += 1;
      }

      processed += 1;
      if (processed % 10 === 0 || processed === toFetch.length) {
        const pct = Math.round((processed / toFetch.length) * 100);
        console.log(
          `  ${processed}/${toFetch.length} (${pct}%) — fetched ${written}/${fetchTotal}, renamed ${moved}`,
        );
      }
    },
  });

  let deleted = 0;
  if (seen.size === 0) {
    console.warn("Discovered 0 notes; skipping prune to avoid data loss.");
  } else {
    for (const [id, { path }] of disk) {
      if (!seen.has(id)) {
        await rm(path, { force: true });
        deleted += 1;
      }
    }
  }

  const elapsedS = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `Done in ${elapsedS}s. Synced ${seen.size} note(s); wrote ${written}, moved ${moved}, deleted ${deleted}.`,
  );
}

syncGranola().catch((err) => {
  console.error("Granola sync failed:", err);
  process.exit(1);
});
