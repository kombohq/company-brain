/**
 * Sync Notion pages shared with an internal integration into context/notion/ as markdown.
 *
 * Incremental: the cheap search + data-source queries return last_edited_time for
 * every accessible page; only pages whose timestamp changed (or that are new) get
 * the expensive retrieveMarkdown call. State lives in each .md's frontmatter, so
 * there is no index file. Pages removed/unshared in Notion are pruned.
 *
 * Usage:
 *   bun run notion:sync          # incremental
 *   bun run notion:sync full     # ignore on-disk timestamps, refetch all
 */

import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "path";
import { processParallel } from "../../lib/process-parallel.js";
import { contextDir } from "../../lib/paths.js";
import { NotionSyncClient, type NotionNode } from "./notion-client.js";
import { enumerate } from "./enumerate.js";
import {
  bodyOf,
  computePaths,
  parseFrontmatter,
  serializePage,
} from "./markdown.js";

// Defaults to context/notion; NOTION_OUT_DIR lets one workflow per integration
// sync into its own directory.
const OUT_DIR = process.env.NOTION_OUT_DIR
  ? resolve(process.env.NOTION_OUT_DIR)
  : contextDir("notion");
const FETCH_CONCURRENCY = 3;

type DiskEntry = { relPath: string; lastEditedTime: string };

function parseArgs() {
  return { full: process.argv.slice(2).includes("full") };
}

async function scanDisk(): Promise<Map<string, DiskEntry>> {
  const map = new Map<string, DiskEntry>();
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
        const parsed = parseFrontmatter(await readFile(full, "utf-8"));
        if (parsed) {
          map.set(parsed.notionId, {
            relPath: relative(OUT_DIR, full).split(sep).join("/"),
            lastEditedTime: parsed.lastEditedTime,
          });
        }
      }
    }
  };
  await walk(OUT_DIR);
  return map;
}

async function writePage(relPath: string, content: string): Promise<void> {
  const dest = join(OUT_DIR, relPath);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, content, "utf-8");
}

/** Read the body of a page already on disk (to rewrite it on a move without refetching). */
async function readDiskBody(relPath: string): Promise<string> {
  return bodyOf(await readFile(join(OUT_DIR, relPath), "utf-8"));
}

/** Remove now-empty directories left behind by deletions/moves. */
async function pruneEmptyDirs(dir: string): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  let empty = true;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const childEmpty = await pruneEmptyDirs(join(dir, entry.name));
      if (!childEmpty) {
        empty = false;
      }
    } else {
      empty = false;
    }
  }
  if (empty && dir !== OUT_DIR) {
    await rm(dir, { recursive: true, force: true });
  }
  return empty;
}

async function syncNotion(): Promise<void> {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error("NOTION_TOKEN is not set");
  }
  const { full } = parseArgs();

  const client = new NotionSyncClient(token);
  await mkdir(OUT_DIR, { recursive: true });
  const startedAt = Date.now();

  console.log("Enumerating shared pages and data sources...");
  const nodes = await enumerate(client);
  console.log("Fetching workspace users...");
  const users = await client.listUsers();
  const pathById = computePaths(nodes);
  const pathByNormId = new Map(
    [...pathById].map(([id, p]) => [id.replace(/-/g, ""), p]),
  );
  const titleById = new Map(nodes.map((n) => [n.id, n.title]));
  const titleByNormId = new Map(
    nodes.map((n) => [n.id.replace(/-/g, ""), n.title]),
  );
  const disk = await scanDisk();
  console.log(`Found ${nodes.length} node(s) in Notion, ${disk.size} on disk.`);

  const isChanged = (n: NotionNode) =>
    full || disk.get(n.id)?.lastEditedTime !== n.lastEditedTime;
  // Only page bodies cost an API call; data sources regenerate from schema for free.
  const needsFetch = (n: NotionNode) => n.type === "page" && isChanged(n);

  const fetchTotal = nodes.filter(needsFetch).length;
  console.log(`Fetching content for ${fetchTotal} new/changed page(s)...`);

  const fetchStart = Date.now();
  let written = 0;
  let moved = 0;
  let fetched = 0;
  await processParallel({
    concurrency: FETCH_CONCURRENCY,
    data: nodes,
    fn: async (node) => {
      const desiredPath = pathById.get(node.id)!;
      const onDisk = disk.get(node.id);
      const samePath = onDisk?.relPath === desiredPath;
      if (!isChanged(node) && samePath) {
        return;
      }

      const fetch = needsFetch(node);
      let body = "";
      let truncated = false;
      if (fetch) {
        const md = await client.pageMarkdown(node.id);
        body = md.markdown;
        truncated = md.truncated;
      } else if (node.type === "page" && onDisk) {
        body = await readDiskBody(onDisk.relPath);
      }

      const relHref = (notionId: string): string | null => {
        const target = pathByNormId.get(notionId.replace(/-/g, ""));
        if (!target) {
          return null;
        }
        const rel = posix.relative(posix.dirname(desiredPath), target);
        return rel.startsWith(".") ? rel : `./${rel}`;
      };
      const resolveRelation = (id: string): string => {
        const title = (titleById.get(id) ?? "").trim();
        const href = relHref(id);
        if (href) {
          return `[${title || "Untitled"}](${href})`;
        }
        return title;
      };
      const resolvers = {
        link: relHref,
        title: (id: string) =>
          (titleByNormId.get(id.replace(/-/g, "")) ?? "").trim() || null,
        user: (id: string) => users.get(id)?.name ?? null,
      };
      await writePage(
        desiredPath,
        serializePage(node, body, resolveRelation, users, resolvers, truncated),
      );
      if (onDisk && onDisk.relPath !== desiredPath) {
        await rm(join(OUT_DIR, onDisk.relPath), { force: true });
        moved += 1;
      } else {
        written += 1;
      }
      if (fetch && ++fetched % 25 === 0) {
        const elapsed = (Date.now() - fetchStart) / 1000;
        const rate = fetched / elapsed;
        const etaS = Math.round((fetchTotal - fetched) / rate);
        const pct = Math.round((fetched / fetchTotal) * 100);
        console.log(
          `  fetched ${fetched}/${fetchTotal} (${pct}%, ${rate.toFixed(1)}/s, ~${etaS}s left)`,
        );
      }
    },
  });

  // Guardrail: a failed/empty enumerate must never wipe an existing mirror.
  let deleted = 0;
  if (nodes.length === 0 && disk.size > 0) {
    console.warn(
      `Enumerate returned 0 nodes but ${disk.size} file(s) are on disk; skipping prune to avoid data loss.`,
    );
  } else {
    for (const [id, entry] of disk) {
      if (!pathById.has(id)) {
        await rm(join(OUT_DIR, entry.relPath), { force: true });
        deleted += 1;
      }
    }
    await pruneEmptyDirs(OUT_DIR);
  }

  const elapsedS = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `Done in ${elapsedS}s. Wrote ${written}, moved ${moved}, deleted ${deleted}.`,
  );
}

syncNotion().catch((err) => {
  console.error("Notion sync failed:", err);
  process.exit(1);
});
