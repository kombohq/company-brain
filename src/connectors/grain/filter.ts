import type { Recording } from "./client.js";
import { shouldSync } from "./options.js";

// Combines the GRAIN_AFTER cutoff with the user's shouldSync() predicate.
export function keepRecording(
  recording: Recording,
  afterMs: number | null,
): boolean {
  if (
    afterMs !== null &&
    new Date(recording.start_datetime).getTime() < afterMs
  ) {
    return false;
  }
  return shouldSync(recording);
}
