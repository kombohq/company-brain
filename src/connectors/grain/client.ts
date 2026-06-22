/**
 * Find the Grain API documentation here: https://developers.grain.com/
 */

const BASE_URL = "https://api.grain.com";
const API_VERSION = "2025-10-31";
const MAX_RETRIES = 6;
const RETRY_BASE_MS = 2_000;

export type ParticipantScope = "internal" | "external" | "unknown";
export type MeetingScope = "internal" | "external";

export interface Team {
  id: string;
  name: string;
}

export interface MeetingType {
  id: string;
  name: string;
  scope: MeetingScope;
}

export interface Participant {
  id: string;
  name: string;
  email: string | null;
  scope: ParticipantScope;
  confirmed_attendee: boolean;
  observed_join_time: string | null;
  observed_leave_time: string | null;
  hs_contact_id: string | null;
}

export interface CalendarEvent {
  ical_uid: string | null;
}

export interface Hubspot {
  hubspot_company_ids: string[];
  hubspot_deal_ids: string[];
}

export type RecordingSource =
  | "aircall"
  | "local_capture"
  | "meet"
  | "teams"
  | "upload"
  | "webex"
  | "zoom"
  | "other";

export type MediaType = "audio" | "transcript" | "video";

export interface Recording {
  id: string;
  title: string;
  source: RecordingSource;
  url: string;
  media_type: MediaType;
  tags: string[];
  start_datetime: string;
  end_datetime: string;
  duration_ms: number;
  thumbnail_url: string | null;
  teams: Team[];
  meeting_type: MeetingType | null;
  participants: Participant[];
  calendar_event: CalendarEvent | null;
  hubspot: Hubspot;
}

export interface TranscriptSegment {
  participant_id: string | null;
  speaker: string;
  start: number;
  end: number;
  text: string;
}

interface ListRecordingsResponse {
  cursor: string | null;
  recordings: Recording[];
}

const LIST_INCLUDE = {
  participants: true,
  calendar_event: true,
  hubspot: true,
};

export class GrainClient {
  private readonly headers: HeadersInit;

  constructor(apiKey: string) {
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Public-Api-Version": API_VERSION,
    };
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: this.headers,
      });
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const waitMs =
          retryAfter > 0 ? retryAfter * 1000 : RETRY_BASE_MS * 2 ** attempt;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Grain API ${res.status} for ${path}: ${body.slice(0, 300)}`,
        );
      }
      return res;
    }
  }

  // afterDatetime narrows the listing to recordings on/after an ISO timestamp.
  // (Grain's docs swap the after_/before_ descriptions; after_datetime is the
  // one that returns recordings whose start_datetime is >= the value.)
  async *listRecordings(afterDatetime?: string): AsyncGenerator<Recording> {
    let cursor: string | null = null;
    do {
      const body: Record<string, unknown> = { include: LIST_INCLUDE };
      if (afterDatetime) {
        body.filter = { after_datetime: afterDatetime };
      }
      if (cursor) {
        body.cursor = cursor;
      }
      const res = await this.request("/_/public-api/v2/recordings", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const page = (await res.json()) as ListRecordingsResponse;
      for (const recording of page.recordings) {
        yield recording;
      }
      cursor = page.recordings.length > 0 ? page.cursor : null;
    } while (cursor !== null);
  }

  async getTranscript(recordingId: string): Promise<TranscriptSegment[]> {
    const res = await this.request(
      `/_/public-api/v2/recordings/${recordingId}/transcript`,
      { method: "GET" },
    );
    return (await res.json()) as TranscriptSegment[];
  }
}
