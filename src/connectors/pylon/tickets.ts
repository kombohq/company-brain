/** Ticket-side of the sync: read what's on disk, fetch + write changed tickets. */

import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { TICKETS_DIR } from "./config.js";
import {
  accountFileName,
  parseTicket,
  serializeTicket,
  ticketFileName,
  type AccountRef,
} from "./markdown.js";
import type { PylonAccount, PylonClient, PylonIssue } from "./pylon-client.js";

export type TicketMeta = {
  updatedAt: string;
  fileName: string;
  accountId: string | null;
  number: number;
  title: string;
};

/** Every ticket on disk, keyed by Pylon id (for incrementality + account backlinks). */
export async function scanTickets(): Promise<Map<string, TicketMeta>> {
  const byId = new Map<string, TicketMeta>();
  let entries;
  try {
    entries = await readdir(TICKETS_DIR, { withFileTypes: true });
  } catch {
    return byId;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const parsed = parseTicket(
      await readFile(join(TICKETS_DIR, entry.name), "utf-8"),
    );
    if (parsed) {
      byId.set(parsed.pylonId, {
        updatedAt: parsed.updatedAt,
        fileName: entry.name,
        accountId: parsed.accountId,
        number: parsed.number,
        title: parsed.title,
      });
    }
  }
  return byId;
}

function accountRef(account?: PylonAccount): AccountRef | undefined {
  if (!account) {
    return undefined;
  }
  return {
    name: account.name ?? "Account",
    file: `../accounts/${accountFileName(account)}`,
  };
}

/** Fetch a ticket's messages, write its file, and record it in `tickets`. */
export async function fetchAndWriteTicket(
  client: PylonClient,
  issue: PylonIssue,
  accountsById: Map<string, PylonAccount>,
  tickets: Map<string, TicketMeta>,
): Promise<void> {
  const messages = await client.fetchMessages(issue.id);
  const account = issue.account?.id
    ? accountsById.get(issue.account.id)
    : undefined;
  const fileName = ticketFileName(issue);
  await writeFile(
    join(TICKETS_DIR, fileName),
    serializeTicket(issue, messages, accountRef(account)),
    "utf-8",
  );
  tickets.set(issue.id, {
    updatedAt: issue.updated_at,
    fileName,
    accountId: issue.account?.id ?? null,
    number: issue.number,
    title: issue.title,
  });
}

export async function ensureTicketsDir(): Promise<void> {
  await mkdir(TICKETS_DIR, { recursive: true });
}
