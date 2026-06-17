import matter from "gray-matter";
import type { Note } from "./client.js";

export function serializeNote(note: Note): string {
  const ev = note.calendar_event;
  const frontmatter: Record<string, unknown> = {
    granola_id: note.id,
    title: note.title ?? `Meeting ${note.id}`,
    created_at: note.created_at,
    updated_at: note.updated_at,
    web_url: note.web_url,
    owner: { name: note.owner.name, email: note.owner.email },
    attendees: note.attendees.map((a) => ({ name: a.name, email: a.email })),
    folders: note.folder_membership.map((f) => ({
      name: f.name,
      id: f.id,
      parent_folder_id: f.parent_folder_id,
    })),
    calendar_event: ev
      ? {
          title: ev.event_title,
          start: ev.scheduled_start_time,
          end: ev.scheduled_end_time,
          organiser: ev.organiser,
          invitees: ev.invitees.map((i) => i.email),
        }
      : null,
  };

  const parts: string[] = [];

  if (note.transcript && note.transcript.length > 0) {
    const hasDiarization = note.transcript.some(
      (s) => s.speaker.diarization_label,
    );
    const disclaimer = hasDiarization
      ? `> Speaker labels (Speaker A, B, …) are assigned by who spoke first in this conversation and are not consistent across meetings.`
      : `> "microphone" = audio captured from the local mic; "speaker" = audio from speakers/headphones. Multiple people may talk through either channel — do not assume who is who.`;
    const lines = ["## Transcript", "", disclaimer];
    for (const seg of note.transcript) {
      const label = seg.speaker.diarization_label ?? seg.speaker.source;
      lines.push(`\n**${label}:** ${seg.text}`);
    }
    parts.push(lines.join("\n"));
  }

  const body = parts.join("\n\n");
  return matter.stringify(`\n${body}\n`, frontmatter);
}

export function idOf(content: string): string | null {
  const { data } = matter(content);
  return typeof data.granola_id === "string" ? data.granola_id : null;
}

export function updatedAtOf(content: string): number | null {
  const { data } = matter(content);
  const val = data.updated_at;
  if (!val) {
    return null;
  }
  const ms = new Date(val as string | Date).getTime();
  return Number.isNaN(ms) ? null : ms;
}
