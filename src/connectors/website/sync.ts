/**
 * Mirror a website into context/<host>/ as markdown, one file per page.
 *
 * Configured through env vars so one workflow step can sync any site:
 *   WEBSITE_URL       start page, or a sitemap (.xml); its host bounds the crawl
 *   WEBSITE_INCLUDE   regex (optional); only paths matching it are synced
 *   WEBSITE_OUT_DIR   directory to mirror into (optional; defaults to context/<host>)
 *   WEBSITE_MAX_PAGES safety cap on pages per run (optional; defaults to 1000)
 *
 * Pages that disappear upstream are pruned: every file records its source URL in
 * frontmatter, and files whose URL is no longer reachable are deleted. A run that
 * discovers nothing skips pruning so a transient outage can't wipe the mirror.
 *
 * Usage:
 *   WEBSITE_URL=https://example.com bun run website:sync
 */

import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { contextDir } from "../../lib/paths.js";
import { processParallel } from "../../lib/process-parallel.js";
import { discover, fetchText, relPathForUrl } from "./discover.js";
import { htmlToMarkdown, pageTitle, serializePage, urlOf } from "./markdown.js";

const FETCH_CONCURRENCY = 5;
const DEFAULT_MAX_PAGES = 1000;

function config() {
  const startUrl = process.env.WEBSITE_URL?.trim();
  if (!startUrl) {
    throw new Error("WEBSITE_URL is required (a page URL or a sitemap .xml)");
  }
  const includeSrc = process.env.WEBSITE_INCLUDE?.trim();
  const maxPages = Number(process.env.WEBSITE_MAX_PAGES) || DEFAULT_MAX_PAGES;
  const outDir = process.env.WEBSITE_OUT_DIR
    ? resolve(process.env.WEBSITE_OUT_DIR)
    : contextDir(new URL(startUrl).host);
  return {
    startUrl,
    include: includeSrc ? new RegExp(includeSrc) : undefined,
    maxPages,
    outDir,
  };
}

/** Map every synced page's URL to the file currently holding it on disk. */
async function scanDisk(outDir: string): Promise<Map<string, string>> {
  const byUrl = new Map<string, string>();
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".md")) {
        const url = urlOf(await readFile(full, "utf-8"));
        if (url) {
          byUrl.set(url, full);
        }
      }
    }
  };
  await walk(outDir);
  return byUrl;
}

async function syncWebsite(): Promise<void> {
  const { startUrl, include, maxPages, outDir } = config();
  const startedAt = Date.now();

  console.log(`Discovering pages from ${startUrl}...`);
  const { urls, html } = await discover({ startUrl, include, maxPages });
  const disk = await scanDisk(outDir);
  console.log(`Found ${urls.length} page(s); ${disk.size} already on disk.`);

  await mkdir(outDir, { recursive: true });
  const synced = new Set<string>();
  let written = 0;
  let failed = 0;
  await processParallel({
    concurrency: FETCH_CONCURRENCY,
    data: urls,
    fn: async (url) => {
      let body = html.get(url);
      if (body === undefined) {
        try {
          body = await fetchText(url);
        } catch (err) {
          failed += 1;
          console.warn(`  skip ${url}: ${(err as Error).message}`);
          return;
        }
      }
      const dest = join(outDir, relPathForUrl(url));
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(
        dest,
        serializePage(url, pageTitle(body) || url, htmlToMarkdown(body)),
      );
      synced.add(url);
      written += 1;
    },
  });

  let deleted = 0;
  if (synced.size === 0) {
    console.warn("Discovered 0 pages; skipping prune to avoid data loss.");
  } else {
    for (const [url, file] of disk) {
      if (!synced.has(url)) {
        await rm(file, { force: true });
        deleted += 1;
      }
    }
  }

  const elapsedS = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `Done in ${elapsedS}s. Wrote ${written}, deleted ${deleted}, failed ${failed}.`,
  );
}

syncWebsite().catch((err) => {
  console.error("Website sync failed:", err);
  process.exit(1);
});
