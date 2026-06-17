/** Account-side of the sync: write one file per account, prune ones that vanish. */

import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { ACCOUNTS_DIR } from "./config.js";
import {
  accountFileName,
  parseAccountId,
  serializeAccount,
  type TicketLink,
} from "./markdown.js";
import type { PylonAccount } from "./pylon-client.js";
import type { TicketMeta } from "./tickets.js";

function ticketLinksByAccount(
  tickets: Map<string, TicketMeta>,
): Map<string, TicketLink[]> {
  const byAccount = new Map<string, TicketLink[]>();
  for (const meta of tickets.values()) {
    if (!meta.accountId) {
      continue;
    }
    const links = byAccount.get(meta.accountId) ?? [];
    links.push({
      fileName: meta.fileName,
      number: meta.number,
      title: meta.title,
    });
    byAccount.set(meta.accountId, links);
  }
  return byAccount;
}

export async function writeAccounts(
  accounts: PylonAccount[],
  tickets: Map<string, TicketMeta>,
): Promise<number> {
  const links = ticketLinksByAccount(tickets);
  for (const account of accounts) {
    await writeFile(
      join(ACCOUNTS_DIR, accountFileName(account)),
      serializeAccount(account, links.get(account.id) ?? []),
      "utf-8",
    );
  }
  return accounts.length;
}

/** Delete account files whose account no longer exists upstream (skipped if none were fetched). */
export async function pruneAccounts(accounts: PylonAccount[]): Promise<number> {
  if (accounts.length === 0) {
    return 0;
  }
  const keep = new Set(accounts.map((a) => a.id));
  let entries;
  try {
    entries = await readdir(ACCOUNTS_DIR, { withFileTypes: true });
  } catch {
    return 0;
  }
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const id = parseAccountId(
      await readFile(join(ACCOUNTS_DIR, entry.name), "utf-8"),
    );
    if (id && !keep.has(id)) {
      await rm(join(ACCOUNTS_DIR, entry.name), { force: true });
      deleted += 1;
    }
  }
  return deleted;
}

export async function ensureAccountsDir(): Promise<void> {
  await mkdir(ACCOUNTS_DIR, { recursive: true });
}
