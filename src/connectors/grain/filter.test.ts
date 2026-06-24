import { describe, expect, test } from "bun:test";
import type { Recording } from "./client.js";
import { keepRecording } from "./filter.js";

const cutoffIso = "2025-03-01T00:00:00Z";
const cutoff = new Date(cutoffIso).getTime();

describe("keepRecording", () => {
  test("keeps a recording after the cutoff", () => {
    const recording = makeRecording("2025-03-02T10:00:00Z");
    expect(keepRecording(recording, cutoff)).toBe(true);
  });

  test("keeps a recording exactly at the cutoff", () => {
    // The cutoff is exclusive (start < afterMs drops), so the boundary instant
    // itself is kept.
    const recording = makeRecording(cutoffIso);
    expect(keepRecording(recording, cutoff)).toBe(true);
  });

  test("drops a recording before the cutoff", () => {
    const recording = makeRecording("2025-02-28T10:00:00Z");
    expect(keepRecording(recording, cutoff)).toBe(false);
  });

  test("keeps everything when there is no cutoff", () => {
    const recording = makeRecording("2000-01-01T00:00:00Z");
    expect(keepRecording(recording, null)).toBe(true);
  });
});

function makeRecording(startDatetime: string): Recording {
  return {
    id: "rec_1",
    title: "Call",
    source: "zoom",
    url: "https://grain.com/share/rec_1",
    media_type: "video",
    tags: [],
    start_datetime: startDatetime,
    end_datetime: startDatetime,
    duration_ms: 0,
    thumbnail_url: null,
    teams: [],
    meeting_type: null,
    participants: [],
    calendar_event: null,
    hubspot: { hubspot_company_ids: [], hubspot_deal_ids: [] },
  };
}
