import { describe, expect, test } from "bun:test";
import matter from "gray-matter";
import type { Note } from "./client.js";
import { idOf, serializeNote, updatedAtOf } from "./markdown.js";

describe("serializeNote", () => {
  test("renders frontmatter for a note without a transcript", () => {
    const md = serializeNote(makeNote()).trimEnd();
    expect(md).toMatchInlineSnapshot(`
      "---
      granola_id: note-1
      title: Weekly sync
      created_at: '2025-01-01T09:00:00Z'
      updated_at: '2025-01-01T10:00:00Z'
      web_url: 'https://notes.granola.ai/note-1'
      owner:
        name: Ada Lovelace
        email: ada@acme.dev
      attendees:
        - name: Grace Hopper
          email: grace@acme.dev
      folders: []
      calendar_event: null
      ---"
    `);
    expect(md).not.toContain("## Transcript");
  });

  test("serializes folder membership and a populated calendar event", () => {
    const note = makeNote({
      folder_membership: [
        {
          id: "folder-1",
          object: "folder",
          name: "Engineering",
          parent_folder_id: "folder-root",
        },
      ],
      calendar_event: {
        event_title: "Sprint planning",
        invitees: [{ email: "ada@acme.dev" }, { email: "grace@acme.dev" }],
        organiser: "ada@acme.dev",
        calendar_event_id: "cal-1",
        scheduled_start_time: "2025-01-01T09:00:00Z",
        scheduled_end_time: "2025-01-01T10:00:00Z",
      },
    });
    const md = serializeNote(note);
    const { data } = matter(md);

    expect(data.folders).toEqual([
      { name: "Engineering", id: "folder-1", parent_folder_id: "folder-root" },
    ]);
    expect(data.calendar_event).toEqual({
      title: "Sprint planning",
      start: "2025-01-01T09:00:00Z",
      end: "2025-01-01T10:00:00Z",
      organiser: "ada@acme.dev",
      invitees: ["ada@acme.dev", "grace@acme.dev"],
    });
  });

  test("uses the diarization disclaimer when segments carry speaker labels", () => {
    const note = makeNote({
      transcript: [
        {
          speaker: { source: "microphone", diarization_label: "Speaker A" },
          text: "Hello there.",
          start_time: "2025-01-01T09:00:01Z",
          end_time: "2025-01-01T09:00:02Z",
        },
        {
          speaker: { source: "speaker", diarization_label: "Speaker B" },
          text: "General Kenobi.",
          start_time: "2025-01-01T09:00:03Z",
          end_time: "2025-01-01T09:00:04Z",
        },
      ],
    });
    const md = serializeNote(note);
    expect(md).toContain("## Transcript");
    expect(md).toContain("Speaker labels (Speaker A, B, …) are assigned");
    expect(md).toContain("**Speaker A:** Hello there.");
    expect(md).toContain("**Speaker B:** General Kenobi.");
  });

  test("uses the channel disclaimer and source label when diarization is absent", () => {
    const note = makeNote({
      transcript: [
        {
          speaker: { source: "microphone" },
          text: "Local audio.",
          start_time: "2025-01-01T09:00:01Z",
          end_time: "2025-01-01T09:00:02Z",
        },
        {
          speaker: { source: "speaker" },
          text: "Remote audio.",
          start_time: "2025-01-01T09:00:03Z",
          end_time: "2025-01-01T09:00:04Z",
        },
      ],
    });
    const md = serializeNote(note);
    expect(md).toContain("## Transcript");
    expect(md).toContain('"microphone" = audio captured from the local mic');
    expect(md).toContain("**microphone:** Local audio.");
    expect(md).toContain("**speaker:** Remote audio.");
    expect(md).not.toContain("Speaker labels");
  });

  test("falls back to a generated title when none is set", () => {
    const md = serializeNote(makeNote({ title: null }));
    expect(md).toContain("title: Meeting note-1");
  });
});

describe("idOf", () => {
  test("round-trips the id stored in frontmatter", () => {
    const md = serializeNote(makeNote({ id: "abc-123" }));
    expect(idOf(md)).toBe("abc-123");
  });

  test("returns null when no granola_id marker is present", () => {
    expect(idOf("# just markdown")).toBeNull();
  });
});

describe("updatedAtOf", () => {
  test("parses the stored timestamp into epoch millis", () => {
    const md = serializeNote(makeNote({ updated_at: "2025-01-01T10:00:00Z" }));
    expect(updatedAtOf(md)).toBe(Date.parse("2025-01-01T10:00:00Z"));
  });

  test("returns null when updated_at is missing", () => {
    expect(updatedAtOf("# just markdown")).toBeNull();
  });

  test("returns null for an unparseable updated_at", () => {
    expect(updatedAtOf("---\nupdated_at: not-a-date\n---\n")).toBeNull();
  });
});

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    object: "note",
    title: "Weekly sync",
    owner: { name: "Ada Lovelace", email: "ada@acme.dev" },
    created_at: "2025-01-01T09:00:00Z",
    updated_at: "2025-01-01T10:00:00Z",
    web_url: "https://notes.granola.ai/note-1",
    calendar_event: null,
    attendees: [{ name: "Grace Hopper", email: "grace@acme.dev" }],
    folder_membership: [],
    summary_text: "",
    summary_markdown: null,
    transcript: null,
    ...overrides,
  };
}
