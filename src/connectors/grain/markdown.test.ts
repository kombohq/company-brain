import { describe, expect, test } from "bun:test";
import matter from "gray-matter";
import type { Participant, Recording, TranscriptSegment } from "./client.js";
import { idOf, serializeRecording } from "./markdown.js";

const transcript: TranscriptSegment[] = [
  {
    participant_id: "p_1",
    speaker: "Alice",
    start: 0,
    end: 5,
    text: "Hi there.",
  },
  {
    participant_id: "p_2",
    speaker: "Bob",
    start: 5,
    end: 9,
    text: "Hello!",
  },
];

describe("serializeRecording", () => {
  test("writes frontmatter and a transcript section", () => {
    const md = serializeRecording(makeRecording(), transcript);
    expect(md).toMatchInlineSnapshot(`
      "---
      grain_id: rec_1
      title: Acme intro call
      source: zoom
      url: 'https://grain.com/share/rec_1'
      media_type: video
      start_datetime: '2025-03-01T10:00:00Z'
      end_datetime: '2025-03-01T10:30:00Z'
      duration_ms: 1800000
      tags:
        - sales
      teams:
        - id: team_1
          name: Sales
      meeting_type:
        id: mt_1
        name: Discovery
        scope: external
      participants:
        - name: Alice
          email: alice@kombo.dev
          scope: internal
          confirmed_attendee: true
          hs_contact_id: null
        - name: Bob
          email: bob@acme.com
          scope: external
          confirmed_attendee: true
          hs_contact_id: hs_9
      calendar_event:
        ical_uid: ical_123
      hubspot:
        company_ids:
          - co_1
        deal_ids:
          - deal_1
      ---

      ## Transcript

      **Alice:** Hi there.

      **Bob:** Hello!
      "
    `);
  });

  test("orders participants by id, not by name", () => {
    // Name order and id order disagree: "Alice" < "Bob" alphabetically, but
    // Alice's id (p_2) sorts after Bob's (p_1), so Bob must come first.
    const recording = makeRecording({
      participants: [
        makeParticipant({ id: "p_2", name: "Alice", email: "alice@kombo.dev" }),
        makeParticipant({ id: "p_1", name: "Bob", email: "bob@acme.com" }),
      ],
    });
    const md = serializeRecording(recording, []);
    const names = matter(md).data.participants.map(
      (p: { name: string }) => p.name,
    );
    expect(names).toEqual(["Bob", "Alice"]);
  });

  test("omits the transcript section when there are no segments", () => {
    const md = serializeRecording(makeRecording(), []);
    expect(md).not.toContain("## Transcript");
  });

  test("renders nullable meeting_type and optional fields", () => {
    const recording = makeRecording({
      meeting_type: null,
      tags: [],
      teams: [],
      calendar_event: null,
    });
    const md = serializeRecording(recording, []);
    expect(md).toContain("meeting_type: null");
    expect(md).toContain("calendar_event: null");
    expect(md).toContain("tags: []");
  });
});

describe("idOf", () => {
  test("round-trips the stored grain_id", () => {
    const md = serializeRecording(makeRecording({ id: "rec_xyz" }), []);
    expect(idOf(md)).toBe("rec_xyz");
  });

  test("returns null for content without the marker", () => {
    expect(idOf("# just markdown")).toBeNull();
  });
});

function makeRecording(overrides: Partial<Recording> = {}): Recording {
  return {
    id: "rec_1",
    title: "Acme intro call",
    source: "zoom",
    url: "https://grain.com/share/rec_1",
    media_type: "video",
    tags: ["sales"],
    start_datetime: "2025-03-01T10:00:00Z",
    end_datetime: "2025-03-01T10:30:00Z",
    duration_ms: 1_800_000,
    thumbnail_url: null,
    teams: [{ id: "team_1", name: "Sales" }],
    meeting_type: { id: "mt_1", name: "Discovery", scope: "external" },
    participants: [
      {
        id: "p_2",
        name: "Bob",
        email: "bob@acme.com",
        scope: "external",
        confirmed_attendee: true,
        observed_join_time: null,
        observed_leave_time: null,
        hs_contact_id: "hs_9",
      },
      {
        id: "p_1",
        name: "Alice",
        email: "alice@kombo.dev",
        scope: "internal",
        confirmed_attendee: true,
        observed_join_time: null,
        observed_leave_time: null,
        hs_contact_id: null,
      },
    ],
    calendar_event: { ical_uid: "ical_123" },
    hubspot: { hubspot_company_ids: ["co_1"], hubspot_deal_ids: ["deal_1"] },
    ...overrides,
  };
}

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: "p_1",
    name: "Alice",
    email: "alice@kombo.dev",
    scope: "internal",
    confirmed_attendee: true,
    observed_join_time: null,
    observed_leave_time: null,
    hs_contact_id: null,
    ...overrides,
  };
}
