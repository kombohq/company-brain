/**
 * Pylon API client. Handles rate limits: retries 429s using `x-retry-after` /
 * `Retry-After`, and after a successful response pauses when
 * `x-rate-limit-remaining` hits 0.
 */

const PYLON_BASE = "https://api.usepylon.com";

const MAX_RATE_LIMIT_RETRIES = 25;
const FALLBACK_POLITE_PAUSE_MS = 3200;
const MIN_RETRY_AFTER_MS = 1_000;
const MAX_RETRY_AFTER_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pylon uses `x-retry-after` (seconds); fall back to standard `Retry-After` (seconds or HTTP-date). */
function parseRetryAfterSeconds(headers: Headers): number | null {
  const x = headers.get("x-retry-after");
  if (x !== null) {
    const n = parseInt(x.trim(), 10);
    if (!Number.isNaN(n) && n >= 0) {
      return Math.max(1, n);
    }
  }
  const r = headers.get("Retry-After");
  if (r === null) {
    return null;
  }
  const asInt = parseInt(r.trim(), 10);
  if (!Number.isNaN(asInt) && asInt >= 0) {
    return Math.max(1, asInt);
  }
  const dateMs = Date.parse(r);
  if (!Number.isNaN(dateMs)) {
    return Math.max(1, Math.ceil((dateMs - Date.now()) / 1000));
  }
  return null;
}

function clampRetryAfterMs(seconds: number | null): number {
  const raw = (seconds ?? 60) * 1000;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(MIN_RETRY_AFTER_MS, raw));
}

async function applyPolitePauseAfterSuccess(headers: Headers): Promise<void> {
  const raw = headers.get("x-rate-limit-remaining");
  if (raw === null) {
    return;
  }
  const remaining = parseInt(raw, 10);
  if (Number.isNaN(remaining) || remaining > 0) {
    return;
  }
  const sec = parseRetryAfterSeconds(headers);
  const ms = sec !== null ? clampRetryAfterMs(sec) : FALLBACK_POLITE_PAUSE_MS;
  console.log(`[pylon] x-rate-limit-remaining=0; pausing ${ms}ms`);
  await sleep(ms);
}

export interface MiniUser {
  id?: string;
  email?: string;
}

export interface MiniContact {
  id?: string;
  email?: string;
}

export interface CsatResponse {
  score?: number;
  comment?: string | null;
}

export interface SlackRef {
  channel_id?: string;
  message_ts?: string;
  workspace_id?: string;
}

export interface PylonIssue {
  id: string;
  number: number;
  title: string;
  body_html?: string;
  state: string;
  type?: string;
  source?: string;
  created_at: string;
  updated_at: string;
  first_response_time?: string;
  first_response_seconds?: number;
  resolution_time?: string;
  resolution_seconds?: number;
  number_of_touches?: number;
  time_in_status_seconds?: Record<string, number>;
  csat_responses?: CsatResponse[];
  slack?: SlackRef;
  link?: string;
  tags?: string[];
  account?: { id?: string };
  assignee?: MiniUser;
  requester?: MiniContact;
  custom_fields?: Record<
    string,
    { slug?: string; value?: string; values?: string[] }
  >;
}

export interface PylonAccount {
  id: string;
  name?: string;
  domain?: string;
  domains?: string[];
  type?: string;
  created_at?: string;
  updated_at?: string;
  external_ids?: Array<{ label?: string; external_id?: string }>;
}

export interface MessageAuthor {
  name?: string;
  contact?: MiniContact;
  user?: MiniUser;
}

export interface PylonMessage {
  id: string;
  message_html: string;
  timestamp: string;
  is_private: boolean;
  author?: MessageAuthor;
}

interface Pagination {
  cursor: string;
  has_next_page: boolean;
}

interface SearchIssuesResponse {
  data: PylonIssue[];
  pagination?: Pagination;
}

interface GetMessagesResponse {
  data: PylonMessage[];
  pagination?: Pagination;
}

interface ListAccountsResponse {
  data: PylonAccount[];
  pagination?: Pagination;
}

export class PylonClient {
  constructor(private readonly token: string) {}

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${PYLON_BASE}${path}`;
    const method = options?.method ?? "GET";

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      if (res.ok) {
        const data = (await res.json()) as T;
        await applyPolitePauseAfterSuccess(res.headers);
        return data;
      }

      const body = await res.text();
      if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const waitMs = clampRetryAfterMs(parseRetryAfterSeconds(res.headers));
        console.log(
          `[pylon] ${method} ${path} → 429; waiting ${waitMs}ms (retry ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`,
        );
        await sleep(waitMs);
        continue;
      }

      throw new Error(`Pylon API ${res.status} on ${method} ${path}: ${body}`);
    }
  }

  /**
   * Every closed issue, following cursor pagination to exhaustion. When
   * `createdAfter` (RFC3339) is set, only issues created after it are returned.
   */
  async listClosedIssues(createdAfter?: string): Promise<PylonIssue[]> {
    const issues: PylonIssue[] = [];
    let cursor: string | undefined;

    const subfilters = [
      { field: "state", operator: "equals", value: "closed" },
    ];
    if (createdAfter) {
      subfilters.push({
        field: "created_at",
        operator: "time_is_after",
        value: createdAfter,
      });
    }
    const filter =
      subfilters.length === 1 ? subfilters[0] : { operator: "and", subfilters };

    do {
      const res = await this.fetch<SearchIssuesResponse>("/issues/search", {
        method: "POST",
        body: JSON.stringify({ filter, limit: 1000, cursor }),
      });
      issues.push(...(res.data ?? []));
      cursor = res.pagination?.has_next_page
        ? res.pagination.cursor
        : undefined;
    } while (cursor);

    return issues;
  }

  /** Every account, following cursor pagination to exhaustion. */
  async fetchAllAccounts(pageSize = 100): Promise<PylonAccount[]> {
    const accounts: PylonAccount[] = [];
    let cursor: string | undefined;

    do {
      const qs = new URLSearchParams({ limit: String(pageSize) });
      if (cursor) {
        qs.set("cursor", cursor);
      }
      const res = await this.fetch<ListAccountsResponse>(`/accounts?${qs}`);
      accounts.push(...(res.data ?? []));
      cursor = res.pagination?.has_next_page
        ? res.pagination.cursor
        : undefined;
    } while (cursor);

    return accounts;
  }

  /** All messages for an issue, following cursor pagination to exhaustion. */
  async fetchMessages(issueId: string): Promise<PylonMessage[]> {
    const messages: PylonMessage[] = [];
    let cursor: string | undefined;

    do {
      const path = `/issues/${issueId}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await this.fetch<GetMessagesResponse>(path);
      messages.push(...(res.data ?? []));
      cursor = res.pagination?.has_next_page
        ? res.pagination.cursor
        : undefined;
    } while (cursor);

    return messages;
  }
}
