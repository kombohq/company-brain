import { join } from "path";

/** Root folder holding all synced context data, committed to Git. */
export const CONTEXT_ROOT = join(
  process.cwd(),
  process.env.CONTEXT_ROOT ?? "context",
);

/** Output folder for a single connector, e.g. contextDir("notion") -> context/notion. */
export function contextDir(name: string): string {
  return join(CONTEXT_ROOT, name);
}
