/**
 * Mirror a Zendesk Help Center's published articles into context/<subdomain>/ as
 * one markdown file per article (frontmatter holds the metadata, body is the
 * article content). Uses the anonymous public API, so no token is needed.
 *
 * Configured through env vars:
 *   ZENDESK_SUBDOMAIN  required; the "X" in X.zendesk.com (e.g. "kombo-api")
 *   ZENDESK_LOCALE     Guide locale segment (optional; defaults to "en-us")
 *   ZENDESK_OUT_DIR    directory to mirror into (optional; defaults to
 *                      context/<subdomain>)
 *
 * Articles that disappear upstream (unpublished or deleted) are pruned. A run
 * that discovers nothing skips pruning so a transient outage can't wipe the
 * mirror.
 *
 * Usage:
 *   ZENDESK_SUBDOMAIN=kombo-api bun run zendesk:sync
 */

import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { contextDir } from "../../lib/paths.js";
import { ZendeskHelpCenterClient } from "./client.js";
import { idOf, serializeArticle } from "./markdown.js";

const DEFAULT_LOCALE = "en-us";

function config() {
  const subdomain = process.env.ZENDESK_SUBDOMAIN?.trim();
  if (!subdomain) {
    throw new Error(
      'ZENDESK_SUBDOMAIN is required (the "X" in X.zendesk.com, e.g. "kombo-api")',
    );
  }
  const locale = process.env.ZENDESK_LOCALE?.trim() || DEFAULT_LOCALE;
  const outDir = process.env.ZENDESK_OUT_DIR
    ? resolve(process.env.ZENDESK_OUT_DIR)
    : contextDir(subdomain);
  return { subdomain, locale, outDir };
}

/** Map every synced article id to the file currently holding it on disk. */
async function scanDisk(outDir: string): Promise<Map<number, string>> {
  const byId = new Map<number, string>();
  let entries;
  try {
    entries = await readdir(outDir, { withFileTypes: true });
  } catch {
    return byId;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const full = join(outDir, entry.name);
    const id = idOf(await readFile(full, "utf-8"));
    if (id != null) {
      byId.set(id, full);
    }
  }
  return byId;
}

export async function syncZendesk(): Promise<void> {
  const { subdomain, locale, outDir } = config();
  const startedAt = Date.now();

  const disk = await scanDisk(outDir);
  console.log(
    `Syncing ${subdomain}.zendesk.com (${locale}); ${disk.size} article(s) already on disk...`,
  );

  await mkdir(outDir, { recursive: true });
  const client = new ZendeskHelpCenterClient(subdomain, locale);
  const seen = new Set<number>();
  let written = 0;

  for await (const article of client.articles()) {
    seen.add(article.id);
    const dest = join(outDir, `${article.id}.md`);
    const existingPath = disk.get(article.id);
    const current = existingPath ? await readFile(existingPath, "utf-8") : null;
    const next = serializeArticle(article);
    if (current !== next) {
      await writeFile(dest, next);
      written += 1;
    }
    // The file was stored under a non-canonical name; drop the stale copy.
    if (existingPath && existingPath !== dest) {
      await rm(existingPath, { force: true });
    }
  }

  let deleted = 0;
  if (seen.size === 0) {
    console.warn("Discovered 0 articles; skipping prune to avoid data loss.");
  } else {
    for (const [id, file] of disk) {
      if (!seen.has(id)) {
        await rm(file, { force: true });
        deleted += 1;
      }
    }
  }

  const elapsedS = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `Done in ${elapsedS}s. Synced ${seen.size} article(s); wrote ${written}, deleted ${deleted}.`,
  );
}

// Only run when invoked directly (`bun run zendesk:sync`), not when imported by tests.
if (import.meta.main) {
  syncZendesk().catch((err) => {
    console.error("Zendesk sync failed:", err);
    process.exit(1);
  });
}
