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

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
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
import type { HelpCenterArticle } from "./client.js";
import { syncZendesk } from "./sync.js";

// --- Test harness --------------------------------------------------------------

/** A page of the Help Center articles API, as the client expects to receive it. */
type ArticlePage = { articles: HelpCenterArticle[]; next_page: string | null };

/** Serves `pages` to the client in order, following each page's `next_page`. */
function serveArticles(pages: ArticlePage[]): () => Response {
  let call = 0;
  return () => {
    const body = pages[call] ?? { articles: [], next_page: null };
    call += 1;
    return Response.json(body);
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
/** The current canned API response; each test swaps this in. */
let respond: () => Response;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "zendesk-e2e-"));
  // Point the connector at our temp dir and give it the minimal required config.
  process.env.ZENDESK_SUBDOMAIN = "acme";
  process.env.ZENDESK_OUT_DIR = outDir;
  delete process.env.ZENDESK_LOCALE; // exercise the en-us default

  respond = () => new Response("no response configured", { status: 500 });
  spyOn(globalThis, "fetch").mockImplementation((async (
    _input: string | URL | Request,
  ) => respond()) as typeof fetch);
});

afterEach(async () => {
  mock.restore();
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
          article({ id: 102, draft: true }), // unpublished → must be skipped
        ],
        true, // a second page follows
      ),
      page([article({ id: 103, title: "Webhooks" })]),
    ]);

    await syncZendesk();

    // 103 only exists on the second page, so seeing it proves `next_page` was
    // followed; the draft (102) is filtered out.
    expect(await mdFiles()).toEqual(["101.md", "103.md"]);

    // The file is the real serializer's output: frontmatter + converted HTML body.
    const md = await readFile(join(outDir, "101.md"), "utf-8");
    expect(md).toContain("zendesk_id: 101");
    expect(md).toContain("title: Connecting an integration");
    expect(md).toContain("## Steps");
    expect(md).toContain("Click **Connect**.");
  });

  test("is idempotent: a second run with identical data rewrites nothing", async () => {
    const data = () =>
      serveArticles([page([article({ id: 101, body: "<p>hi</p>" })])]);

    respond = data();
    await syncZendesk();

    // Backdate the file, then sync the same data again. If the connector rewrote it,
    // the mtime would jump to now; an unchanged file keeps the backdated stamp. This
    // is the contract that keeps Git diffs clean.
    const file = join(outDir, "101.md");
    const past = new Date("2020-01-01T00:00:00Z");
    await utimes(file, past, past);

    respond = data();
    await syncZendesk();

    expect((await stat(file)).mtime).toEqual(past);
  });

  test("moves an article stored under a non-canonical filename to <id>.md", async () => {
    // Simulate a file written by an older version under a legacy name. scanDisk maps
    // it back to its article via the zendesk_id in frontmatter.
    await writeFile(
      join(outDir, "legacy-name.md"),
      "---\nzendesk_id: 101\ntitle: old\n---\n\nold body\n",
    );

    respond = serveArticles([page([article({ id: 101, title: "Renamed" })])]);
    await syncZendesk();

    // The article now lives at its canonical path and the stale copy is gone.
    expect(await mdFiles()).toEqual(["101.md"]);
  });

  test("prunes articles that disappeared upstream", async () => {
    respond = serveArticles([
      page([article({ id: 101 }), article({ id: 102 })]),
    ]);
    await syncZendesk();
    expect(await mdFiles()).toEqual(["101.md", "102.md"]);

    // Next run no longer returns 102 (unpublished/deleted) → its file is pruned.
    respond = serveArticles([page([article({ id: 101 })])]);
    await syncZendesk();
    expect(await mdFiles()).toEqual(["101.md"]);
  });

  test("a run that discovers zero articles skips pruning, to survive an outage", async () => {
    respond = serveArticles([page([article({ id: 101 })])]);
    await syncZendesk();
    expect(await mdFiles()).toEqual(["101.md"]);

    // A transient outage returns an empty list. Pruning here would wipe the mirror,
    // so the connector deliberately keeps everything.
    respond = serveArticles([page([])]);
    await syncZendesk();
    expect(await mdFiles()).toEqual(["101.md"]);
  });
});
