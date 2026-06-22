import { resolve } from "path";
import { contextDir } from "../../lib/paths.js";

export interface GrainConfig {
  apiKey: string;
  outDir: string;
  afterMs: number | null;
  afterIso: string | null;
}

export function getGrainConfig(): GrainConfig {
  const apiKey = process.env.GRAIN_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GRAIN_API_KEY is required");
  }
  const outDir = process.env.GRAIN_OUT_DIR
    ? resolve(process.env.GRAIN_OUT_DIR)
    : contextDir("grain");

  const afterRaw = process.env.GRAIN_AFTER?.trim();
  let afterMs: number | null = null;
  let afterIso: string | null = null;
  if (afterRaw) {
    afterMs = new Date(afterRaw).getTime();
    if (Number.isNaN(afterMs)) {
      throw new Error(`GRAIN_AFTER is not a valid date: ${afterRaw}`);
    }
    afterIso = new Date(afterMs).toISOString();
  }

  return { apiKey, outDir, afterMs, afterIso };
}
