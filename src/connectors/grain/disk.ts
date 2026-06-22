import { readdir, readFile } from "fs/promises";
import { join } from "path";
import type { Recording } from "./client.js";
import { idOf } from "./markdown.js";

export function recordingFilename(recording: Recording): string {
  return `${recording.start_datetime.slice(0, 10)}_${recording.id}.md`;
}

// Map of grain_id -> file path for every recording already mirrored on disk.
export async function scanDisk(outDir: string): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
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
    const id = idOf(await readFile(full, "utf-8"));
    if (id !== null) {
      byId.set(id, full);
    }
  }
  return byId;
}
