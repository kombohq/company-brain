import matter from "gray-matter";
import type { Recording, TranscriptSegment } from "./client.js";

export function serializeRecording(
  recording: Recording,
  transcript: TranscriptSegment[],
): string {
  const frontmatter: Record<string, unknown> = {
    grain_id: recording.id,
    title: recording.title,
    source: recording.source,
    url: recording.url,
    media_type: recording.media_type,
    start_datetime: recording.start_datetime,
    end_datetime: recording.end_datetime,
    duration_ms: recording.duration_ms,
    tags: recording.tags ?? [],
    teams: (recording.teams ?? []).map((t) => ({ id: t.id, name: t.name })),
    meeting_type: recording.meeting_type
      ? {
          id: recording.meeting_type.id,
          name: recording.meeting_type.name,
          scope: recording.meeting_type.scope,
        }
      : null,
    participants: (recording.participants ?? [])
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({
        name: p.name ?? null,
        email: p.email ?? null,
        scope: p.scope ?? null,
        confirmed_attendee: p.confirmed_attendee ?? null,
        hs_contact_id: p.hs_contact_id ?? null,
      })),
    calendar_event: recording.calendar_event
      ? { ical_uid: recording.calendar_event.ical_uid ?? null }
      : null,
    hubspot: {
      company_ids: recording.hubspot?.hubspot_company_ids ?? [],
      deal_ids: recording.hubspot?.hubspot_deal_ids ?? [],
    },
  };

  const lines: string[] = [];
  if (transcript.length > 0) {
    lines.push("## Transcript");
    for (const seg of transcript) {
      lines.push(`\n**${seg.speaker}:** ${seg.text}`);
    }
  }

  return matter.stringify(`\n${lines.join("\n")}\n`, frontmatter);
}

export function idOf(content: string): string | null {
  const { data } = matter(content);
  return typeof data.grain_id === "string" ? data.grain_id : null;
}
