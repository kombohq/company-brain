/**
 * End-to-end test for the Zendesk connector. Only the network (`fetch`) is stubbed;
 * the client, the markdown serializer, and all filesystem I/O run against a real temp
 * dir, so each test documents one behaviour that `zendesk:sync` actually guarantees.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { type FetchHandler, stubFetch } from "../../test-support/fetch.js";
import type { HelpCenterArticle } from "./client.js";
import { syncZendesk } from "./sync.js";

describe("syncZendesk (end-to-end)", () => {
  let outDir: string;
  let respond: FetchHandler;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), "zendesk-e2e-"));
    process.env.ZENDESK_SUBDOMAIN = "acme";
    process.env.ZENDESK_OUT_DIR = outDir;
    delete process.env.ZENDESK_LOCALE; // exercise the en-us default
    // Each test swaps `respond`; until then, any request is a bug.
    respond = () => new Response("no response configured", { status: 500 });
    stubFetch((requestedUrl) => respond(requestedUrl));
  });

  afterEach(async () => {
    mock.restore();
    await rm(outDir, { recursive: true, force: true });
    delete process.env.ZENDESK_SUBDOMAIN;
    delete process.env.ZENDESK_OUT_DIR;
  });

  test("writes one markdown file per published article, following pagination", async () => {
    respond = serveArticles([
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
          article({ id: 102, draft: true }),
        ],
        { hasNextPage: true },
      ),
      page([article({ id: 103, title: "Webhooks" })]),
    ]);

    await syncZendesk();

    // 103 lives only on the second page, so its file proves `next_page` was
    // followed; the draft (102) is filtered out.
    expect(await mdFiles(outDir)).toEqual(["101.md", "103.md"]);

    const md = await readFile(join(outDir, "101.md"), "utf-8");
    expect(md).toContain("zendesk_id: 101");
    expect(md).toContain("title: Connecting an integration");
    expect(md).toContain("## Steps");
    expect(md).toContain("Click **Connect**.");
  });

  test("is idempotent: a second run with identical data rewrites nothing", async () => {
    const articles = [page([article({ id: 101, body: "<p>hi</p>" })])];

    respond = serveArticles(articles);
    await syncZendesk();

    // Backdate the file: an unchanged article is never rewritten, so the stamp
    // survives the second run. This is what keeps Git diffs clean.
    const file = join(outDir, "101.md");
    const past = new Date("2020-01-01T00:00:00Z");
    await utimes(file, past, past);

    respond = serveArticles(articles);
    await syncZendesk();

    expect((await stat(file)).mtime).toEqual(past);
  });

  test("moves an article stored under a non-canonical filename to <id>.md", async () => {
    // A file written by an older version under a legacy name; scanDisk maps it back
    // to its article via the zendesk_id in frontmatter.
    await writeFile(
      join(outDir, "legacy-name.md"),
      "---\nzendesk_id: 101\ntitle: old\n---\n\nold body\n",
    );

    respond = serveArticles([page([article({ id: 101, title: "Renamed" })])]);
    await syncZendesk();

    expect(await mdFiles(outDir)).toEqual(["101.md"]);
  });

  test("prunes articles that disappeared upstream", async () => {
    respond = serveArticles([
      page([article({ id: 101 }), article({ id: 102 })]),
    ]);
    await syncZendesk();
    expect(await mdFiles(outDir)).toEqual(["101.md", "102.md"]);

    respond = serveArticles([page([article({ id: 101 })])]);
    await syncZendesk();
    expect(await mdFiles(outDir)).toEqual(["101.md"]);
  });

  test("a run that discovers zero articles skips pruning, to survive an outage", async () => {
    respond = serveArticles([page([article({ id: 101 })])]);
    await syncZendesk();
    expect(await mdFiles(outDir)).toEqual(["101.md"]);

    // An empty result (e.g. a transient outage) must not wipe the mirror.
    respond = serveArticles([page([])]);
    await syncZendesk();
    expect(await mdFiles(outDir)).toEqual(["101.md"]);
  });
});

// --- Helpers -------------------------------------------------------------------

type ArticlePage = { articles: HelpCenterArticle[]; next_page: string | null };

/** Serves `pages` in sequence: each request returns the next, following `next_page`. */
function serveArticles(pages: ArticlePage[]): FetchHandler {
  let call = 0;
  return () => {
    const body = pages[call] ?? { articles: [], next_page: null };
    call += 1;
    return Response.json(body);
  };
}

function page(
  articles: HelpCenterArticle[],
  { hasNextPage = false } = {},
): ArticlePage {
  return {
    articles,
    next_page: hasNextPage
      ? "https://acme.zendesk.com/api/v2/.../articles.json?page=2"
      : null,
  };
}

function article(
  over: Partial<HelpCenterArticle> & { id: number },
): HelpCenterArticle {
  return { title: `Article ${over.id}`, body: "<p>body</p>", ...over };
}

async function mdFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  return entries.filter((name) => name.endsWith(".md")).toSorted();
}
