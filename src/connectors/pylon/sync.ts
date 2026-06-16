/**
 * Sync closed Pylon tickets and their accounts into context/pylon/ as markdown:
 *   tickets/<date>-TICKET-<n>.md   one file per closed ticket
 *   accounts/<slug>-<id>.md        one file per account, linking to its tickets
 *
 * Tickets are incremental: listing every closed issue is cheap and returns
 * updated_at, so only new or changed tickets have their messages refetched. State
 * lives in each file's frontmatter, so there is no index file. Accounts are few,
 * so they are fully refetched each run and pruned when they disappear upstream.
 *
 * Set PYLON_CREATED_AFTER (a date or RFC3339 timestamp, e.g. "2026-06-14") to
 * only sync tickets created after it. Useful to keep runs small while testing.
 * To force a full refetch, delete context/pylon/tickets/ and run again.
 *
 * Usage:
 *   PYLON_API_TOKEN=... bun run pylon:sync
 */

import { processParallel } from "../../lib/process-parallel.js";
import { ensureAccountsDir, pruneAccounts, writeAccounts } from "./accounts.js";
import { FETCH_CONCURRENCY } from "./config.js";
import { PylonClient } from "./pylon-client.js";
import {
  ensureTicketsDir,
  fetchAndWriteTicket,
  scanTickets,
} from "./tickets.js";

function requireToken(): string {
  const token = process.env.PYLON_API_TOKEN;
  if (!token) {
    throw new Error(
      "PYLON_API_TOKEN is required. Create an API token at https://app.usepylon.com/settings/api-tokens",
    );
  }
  return token;
}

/** Optional created-at cutoff, normalized to RFC3339; throws on an unparseable value. */
function createdAfter(): string | undefined {
  const raw = process.env.PYLON_CREATED_AFTER?.trim();
  if (!raw) {
    return undefined;
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    throw new Error(
      `PYLON_CREATED_AFTER is not a valid date: "${raw}" (use e.g. "2026-06-14")`,
    );
  }
  return new Date(ms).toISOString();
}

async function syncPylon(): Promise<void> {
  const client = new PylonClient(requireToken());
  const since = createdAfter();
  const startedAt = Date.now();

  await ensureTicketsDir();
  await ensureAccountsDir();

  console.log("Fetching accounts...");
  const accounts = await client.fetchAllAccounts();
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  console.log(
    since
      ? `Listing closed Pylon issues created after ${since}...`
      : "Listing closed Pylon issues...",
  );
  const issues = await client.listClosedIssues(since);
  const tickets = await scanTickets();
  console.log(
    `Found ${accounts.length} account(s), ${issues.length} closed issue(s), ${tickets.size} ticket(s) on disk.`,
  );

  const changed = issues.filter(
    (i) => tickets.get(i.id)?.updatedAt !== i.updated_at,
  );
  console.log(
    `Fetching messages for ${changed.length} new/changed ticket(s)...`,
  );

  let written = 0;
  await processParallel({
    concurrency: FETCH_CONCURRENCY,
    data: changed,
    fn: async (issue) => {
      await fetchAndWriteTicket(client, issue, accountsById, tickets);
      if (++written % 25 === 0) {
        console.log(`  wrote ${written}/${changed.length} ticket(s)...`);
      }
    },
  });

  const accountsWritten = await writeAccounts(accounts, tickets);
  const accountsDeleted = await pruneAccounts(accounts);

  const elapsedS = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `Done in ${elapsedS}s. Wrote ${written} ticket(s), ${accountsWritten} account(s), deleted ${accountsDeleted} account(s).`,
  );
}

syncPylon().catch((err) => {
  console.error("Pylon sync failed:", err);
  process.exit(1);
});
