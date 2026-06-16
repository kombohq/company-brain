/**
 * Render Pylon issues and accounts into markdown files with YAML frontmatter.
 * Frontmatter carries durable identity/metadata (a ticket's `updated_at` is what
 * the sync compares to decide whether to refetch), so nothing volatile is stored
 * and an unchanged record produces a byte-identical file. Tickets and accounts
 * cross-link by relative path so an agent can navigate between them.
 */

import matter from "gray-matter";
import { htmlToMarkdown } from "../../lib/html-to-markdown.js";
import type {
  PylonAccount,
  PylonIssue,
  PylonMessage,
  SlackRef,
} from "./pylon-client.js";

const MAX_SLUG_LEN = 80;

function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LEN)
    .replace(/-+$/g, "");
  return slug || "untitled";
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

/** Pylon embeds images as expiring signed URLs (assets.usepylon.com, Signature/Expires). */
const UNSTABLE_IMAGE =
  /!\[([^\]]*)\]\((?:https?:)?\/\/[^)]*(?:usepylon\.com|[?&](?:Signature|Expires)=)[^)]*\)/g;

/** Convert HTML to markdown, then swap expiring image URLs for their stable name. */
function mdFromHtml(html: string): string {
  return htmlToMarkdown(html).replace(UNSTABLE_IMAGE, (_full, alt) =>
    alt ? `[image: ${alt}]` : "[image]",
  );
}

/** Stable, sortable ticket filename: creation date + ticket number, both immutable. */
export function ticketFileName(issue: PylonIssue): string {
  return `${issue.created_at.slice(0, 10)}-TICKET-${issue.number}.md`;
}

export function accountFileName(account: PylonAccount): string {
  return `${slugify(account.name ?? "account")}-${shortId(account.id)}.md`;
}

function formatDuration(seconds?: number): string {
  if (seconds == null || seconds < 0) {
    return "—";
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function authorLabel(msg: PylonMessage): string {
  const a = msg.author;
  if (!a) {
    return "Unknown";
  }
  if (msg.is_private) {
    return `Internal note by ${a.user?.email ?? a.name ?? "Unknown"}`;
  }
  if (a.user?.email) {
    return `Agent (${a.user.email})`;
  }
  if (a.contact?.email) {
    return `Customer (${a.contact.email})`;
  }
  return a.name ?? "Unknown";
}

function pylonLink(issue: PylonIssue): string {
  return issue.link ?? `https://app.usepylon.com/issues/${issue.id}`;
}

/** Slack message permalink: https://<workspace>.slack.com/archives/<channel>/p<ts-no-dot>. */
function slackUrl(slack?: SlackRef): string | null {
  if (!slack?.workspace_id || !slack.channel_id || !slack.message_ts) {
    return null;
  }
  return `https://${slack.workspace_id}.slack.com/archives/${slack.channel_id}/p${slack.message_ts.replace(".", "")}`;
}

function customFields(issue: PylonIssue): Record<string, string> | undefined {
  if (!issue.custom_fields) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [key, cf] of Object.entries(issue.custom_fields)) {
    const value = cf.values?.length ? cf.values.join(", ") : cf.value;
    if (value) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The contact who opened the ticket = author of the first non-private message. */
function requesterEmail(messages: PylonMessage[]): string | null {
  for (const msg of messages) {
    if (!msg.is_private && msg.author?.contact?.email) {
      return msg.author.contact.email;
    }
  }
  return null;
}

export type AccountRef = {
  name: string;
  /** Relative path from a ticket file to the account file, e.g. "../accounts/pult-d9149b84.md". */
  file: string;
};

export function serializeTicket(
  issue: PylonIssue,
  messages: PylonMessage[],
  account?: AccountRef,
): string {
  const csat = issue.csat_responses?.[0];
  const frontmatter: Record<string, unknown> = {
    pylon_id: issue.id,
    number: issue.number,
    title: issue.title,
    state: issue.state,
    type: issue.type ?? null,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    first_response_time: issue.first_response_time ?? null,
    first_response_seconds: issue.first_response_seconds ?? null,
    resolution_time: issue.resolution_time ?? null,
    resolution_seconds: issue.resolution_seconds ?? null,
    number_of_touches: issue.number_of_touches ?? null,
    time_in_status_seconds: issue.time_in_status_seconds ?? null,
    csat_score: csat?.score ?? null,
    csat_comment: csat?.comment ?? null,
    source: issue.source ?? null,
    slack: issue.slack ?? null,
    slack_url: slackUrl(issue.slack),
    tags: issue.tags ?? [],
    requester: requesterEmail(messages),
    assignee_id: issue.assignee?.id ?? null,
    account_id: issue.account?.id ?? null,
    account: account?.name ?? null,
    account_file: account?.file ?? null,
    link: pylonLink(issue),
  };
  const fields = customFields(issue);
  if (fields) {
    frontmatter.custom_fields = fields;
  }

  const lines: string[] = [`# [TICKET-${issue.number}] ${issue.title}`, ""];
  if (account) {
    lines.push(`- **Account:** [${account.name}](${account.file})`);
  }
  const slack = slackUrl(issue.slack);
  if (slack) {
    lines.push(`- **Slack:** [open thread](${slack})`);
  }
  lines.push(
    `- **Resolution time:** ${formatDuration(issue.resolution_seconds)}`,
  );
  if (csat?.score != null) {
    const comment = csat.comment ? ` — "${csat.comment}"` : "";
    lines.push(`- **CSAT:** ${csat.score}/5${comment}`);
  }
  lines.push("");

  if (issue.body_html) {
    lines.push("## Description", "", mdFromHtml(issue.body_html), "");
  }

  const rendered = messages
    .toSorted((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .map((msg) => ({
      label: authorLabel(msg),
      body: mdFromHtml(msg.message_html),
      ts: msg.timestamp,
    }))
    .filter((m) => m.body);
  if (rendered.length > 0) {
    lines.push("---", "", "## Conversation", "");
    for (const m of rendered) {
      lines.push(`### ${m.label} (${m.ts})`, "", m.body, "");
    }
  }

  return matter.stringify(`\n${lines.join("\n").trim()}\n`, frontmatter);
}

export type TicketLink = {
  fileName: string;
  number: number;
  title: string;
};

export function serializeAccount(
  account: PylonAccount,
  tickets: TicketLink[],
): string {
  const frontmatter: Record<string, unknown> = {
    pylon_account_id: account.id,
    name: account.name ?? null,
    domain: account.domain ?? null,
    domains: account.domains ?? [],
    type: account.type ?? null,
    external_ids: account.external_ids ?? [],
    created_at: account.created_at ?? null,
    updated_at: account.updated_at ?? null,
  };

  const lines: string[] = [`# ${account.name ?? "Account"}`, ""];
  lines.push(`- **Domain:** ${account.domain ?? "—"}`);
  lines.push(`- **Type:** ${account.type ?? "—"}`);
  lines.push(`- **Pylon account id:** ${account.id}`);
  lines.push("");

  const sorted = tickets.toSorted((a, b) => b.number - a.number);
  lines.push(`## Tickets (${sorted.length})`, "");
  if (sorted.length === 0) {
    lines.push("_No synced tickets._");
  } else {
    for (const t of sorted) {
      lines.push(
        `- [TICKET-${t.number} — ${t.title}](../tickets/${t.fileName})`,
      );
    }
  }

  return matter.stringify(`\n${lines.join("\n").trim()}\n`, frontmatter);
}

export type ParsedTicket = {
  pylonId: string;
  updatedAt: string;
  accountId: string | null;
  number: number;
  title: string;
};

/** Read a ticket file's identity + the bits needed to link it from its account. */
export function parseTicket(content: string): ParsedTicket | null {
  const { data } = matter(content);
  if (
    typeof data.pylon_id !== "string" ||
    typeof data.updated_at !== "string"
  ) {
    return null;
  }
  return {
    pylonId: data.pylon_id,
    updatedAt: data.updated_at,
    accountId: typeof data.account_id === "string" ? data.account_id : null,
    number: typeof data.number === "number" ? data.number : 0,
    title: typeof data.title === "string" ? data.title : "",
  };
}

export function parseAccountId(content: string): string | null {
  const { data } = matter(content);
  return typeof data.pylon_account_id === "string"
    ? data.pylon_account_id
    : null;
}
