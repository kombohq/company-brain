/**
 * End-to-end test for the Zendesk connector's full sync flow.
 *
 * This exercises the *real* pipeline — pagination, draft filtering, HTML→markdown
 * conversion, frontmatter, idempotent writes, renames, and pruning — with only the
 * single external boundary (`fetch`) stubbed and a real temp directory for output.
 * Nothing is mocked below the network: the client, the markdown serializer, and all
 * filesystem reads/writes run exactly as they do in production.
 *
 * It doubles as living documentation: each test states one behaviour the connector
 * promises, so reading this file tells you what `zendesk:sync` actually does.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { HelpCenterArticle } from "./client.js";
import { syncZendesk } from "./sync.js";

// --- Test harness --------------------------------------------------------------

/** A page of the Help Center articles API, as the client expects to receive it. */
type ArticlePage = { articles: HelpCenterArticle[]; next_page: string | null };

/**
 * Stub the global `fetch` so the client walks `pages` in order: the first request
 * returns pages[0], and each page's `next_page` URL (when set) points at the next.
 * Returns a restore function. This is the only seam we replace — every line of the
 * client's pagination loop still runs against these canned responses.
 */
function mockArticleApi(pages: ArticlePage[]): () => void {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async (_input: string | URL | Request) => {
    const body = pages[call] ?? { articles: [], next_page: null };
    call += 1;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/** One page that links to the next; pass `next: false` for the last page. */
function page(articles: HelpCenterArticle[], next = false): ArticlePage {
  return {
    articles,
    next_page: next
      ? "https://acme.zendesk.com/api/v2/.../articles.json?page=2"
      : null,
  };
}

function article(
  over: Partial<HelpCenterArticle> & { id: number },
): HelpCenterArticle {
  return { title: `Article ${over.id}`, body: "<p>body</p>", ...over };
}

let outDir: string;
let restoreFetch: () => void = () => {};

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "zendesk-e2e-"));
  // Point the connector at our temp dir and give it the minimal required config.
  process.env.ZENDESK_SUBDOMAIN = "acme";
  process.env.ZENDESK_OUT_DIR = outDir;
  delete process.env.ZENDESK_LOCALE; // exercise the en-us default
});

afterEach(async () => {
  restoreFetch();
  await rm(outDir, { recursive: true, force: true });
  delete process.env.ZENDESK_SUBDOMAIN;
  delete process.env.ZENDESK_OUT_DIR;
});

/** Names of the .md files currently in the output dir, sorted for stable asserts. */
async function mdFiles(): Promise<string[]> {
  const entries = await readdir(outDir);
  return entries.filter((n) => n.endsWith(".md")).toSorted();
}

// --- Tests ---------------------------------------------------------------------

describe("syncZendesk (end-to-end)", () => {
  test("writes one markdown file per published article, following pagination", async () => {
    restoreFetch = mockArticleApi([
      page(
        [
          article({
            id: 101,
            title: "Connecting an integration",
            html_url: "https://acme.zendesk.com/hc/en-us/articles/101",
            locale: "en-us",
            section_id: 7,
            label_names: ["setup"],
            body: "<h2>Steps</h2><p>Click <strong>Connect</strong>.</p>",
          }),
          article({ id: 102, draft: true }), // unpublished → must be skipped
        ],
        true, // a second page follows
      ),
      page([article({ id: 103, title: "Webhooks" })]),
    ]);

    await syncZendesk();

    // Published articles from both pages are written; the draft is not.
    expect(await mdFiles()).toEqual(["101.md", "103.md"]);

    // The file is the real serializer's output: frontmatter + converted HTML body.
    const md = await readFile(join(outDir, "101.md"), "utf-8");
    expect(md).toContain("zendesk_id: 101");
    expect(md).toContain("title: Connecting an integration");
    expect(md).toContain("## Steps");
    expect(md).toContain("Click **Connect**.");
  });

  test("is idempotent: a second run with identical data rewrites nothing", async () => {
    const data: ArticlePage[] = [
      page([article({ id: 101, body: "<p>hi</p>" })]),
    ];

    restoreFetch = mockArticleApi(data);
    await syncZendesk();
    const firstWrite = (await stat(join(outDir, "101.md"))).mtimeMs;

    restoreFetch();
    restoreFetch = mockArticleApi(data);
    await syncZendesk();
    const secondWrite = (await stat(join(outDir, "101.md"))).mtimeMs;

    // Unchanged content produces a byte-identical file, so the connector skips the
    // write entirely — the mtime is untouched. This keeps Git diffs clean.
    expect(secondWrite).toBe(firstWrite);
  });

  test("moves an article stored under a non-canonical filename to <id>.md", async () => {
    // Simulate a file written by an older version under a legacy name. scanDisk maps
    // it back to its article via the zendesk_id in frontmatter.
    await writeFile(
      join(outDir, "legacy-name.md"),
      "---\nzendesk_id: 101\ntitle: old\n---\n\nold body\n",
    );

    restoreFetch = mockArticleApi([
      page([article({ id: 101, title: "Renamed" })]),
    ]);
    await syncZendesk();

    // The article now lives at its canonical path and the stale copy is gone.
    expect(await mdFiles()).toEqual(["101.md"]);
  });

  test("prunes articles that disappeared upstream", async () => {
    restoreFetch = mockArticleApi([
      page([article({ id: 101 }), article({ id: 102 })]),
    ]);
    await syncZendesk();
    expect(await mdFiles()).toEqual(["101.md", "102.md"]);

    // Next run no longer returns 102 (unpublished/deleted) → its file is pruned.
    restoreFetch();
    restoreFetch = mockArticleApi([page([article({ id: 101 })])]);
    await syncZendesk();
    expect(await mdFiles()).toEqual(["101.md"]);
  });

  test("a run that discovers zero articles skips pruning, to survive an outage", async () => {
    restoreFetch = mockArticleApi([page([article({ id: 101 })])]);
    await syncZendesk();
    expect(await mdFiles()).toEqual(["101.md"]);

    // A transient outage returns an empty list. Pruning here would wipe the mirror,
    // so the connector deliberately keeps everything.
    restoreFetch();
    restoreFetch = mockArticleApi([page([])]);
    await syncZendesk();
    expect(await mdFiles()).toEqual(["101.md"]);
  });
});
