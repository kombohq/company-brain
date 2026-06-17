const BASE_URL = "https://public-api.granola.ai";
const PAGE_SIZE = 30;
const MAX_RETRIES = 6;
const RETRY_BASE_MS = 2_000;

export interface User {
  name: string | null;
  email: string;
}

export interface CalendarEvent {
  event_title: string | null;
  invitees: { email: string }[];
  organiser: string | null;
  calendar_event_id: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
}

export interface Folder {
  id: string;
  object: "folder";
  name: string;
  parent_folder_id: string | null;
}

export interface Transcript {
  speaker: { source: "microphone" | "speaker"; diarization_label?: string };
  text: string;
  start_time: string;
  end_time: string;
}

export interface NoteSummary {
  id: string;
  object: "note";
  title: string | null;
  owner: User;
  created_at: string;
  updated_at: string;
}

export interface Note extends NoteSummary {
  web_url: string;
  calendar_event: CalendarEvent | null;
  attendees: User[];
  folder_membership: Folder[];
  summary_text: string;
  summary_markdown: string | null;
  transcript: Transcript[] | null;
}

interface ListNotesResponse {
  notes: NoteSummary[];
  hasMore: boolean;
  cursor: string | null;
}

export class GranolaClient {
  private readonly headers: HeadersInit;

  constructor(apiKey: string) {
    this.headers = { Authorization: `Bearer ${apiKey}` };
  }

  private async get<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url.toString(), { headers: this.headers });
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** attempt));
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Granola API ${res.status} for ${path}: ${body.slice(0, 300)}`,
        );
      }
      return res.json() as Promise<T>;
    }
  }

  async *listNotes(): AsyncGenerator<NoteSummary> {
    let cursor: string | null = null;
    do {
      const params: Record<string, string> = { page_size: String(PAGE_SIZE) };
      if (cursor) {
        params.cursor = cursor;
      }
      const page = await this.get<ListNotesResponse>("/v1/notes", params);
      for (const note of page.notes) {
        yield note;
      }
      if (page.hasMore && !page.cursor) {
        throw new Error(
          "Granola API returned hasMore=true with no cursor; cannot continue pagination",
        );
      }
      cursor = page.hasMore ? page.cursor : null;
    } while (cursor !== null);
  }

  getNote(id: string): Promise<Note> {
    return this.get<Note>(`/v1/notes/${id}`, { include: "transcript" });
  }
}
