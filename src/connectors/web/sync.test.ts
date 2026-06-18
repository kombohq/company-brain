/**
 * End-to-end test for the web connector's full crawl + sync flow.
 *
 * Like the Zendesk test, only the network (`fetch`) is stubbed; everything else is
 * real — the BFS crawler, content extraction, HTML→markdown conversion, link
 * rewriting, frontmatter, and filesystem writes/prunes all run as in production.
 * The stub serves a tiny in-memory site so the test is a readable spec of how the
 * crawler turns a linked site into a mirror of local markdown files.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { syncWeb } from "./sync.js";

// --- Test harness --------------------------------------------------------------

/**
 * Stub `fetch` to serve `site` (a map of absolute URL → HTML). Unknown URLs return
 * 404, which the crawler treats as "gone" — so a link to a missing page is simply
 * not mirrored, exactly as for a real dead link. Returns a restore function.
 */
function mockSite(site: Record<string, string>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const html = site[url];
    return html === undefined
      ? new Response("not found", { status: 404 })
      : new Response(html, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/** Wrap content in a full HTML doc with a title; nav/footer are connector "chrome". */
function htmlPage(title: string, main: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>
    <nav>SITE NAVIGATION MENU</nav>
    <main>${main}</main>
    <footer>COPYRIGHT FOOTER</footer>
  </body></html>`;
}

let outDir: string;
let restoreFetch: () => void = () => {};

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "web-e2e-"));
  process.env.WEB_URL = "https://docs.example.com/";
  process.env.WEB_OUT_DIR = outDir;
  delete process.env.WEB_INCLUDE;
  delete process.env.WEB_MAX_PAGES;
});

afterEach(async () => {
  restoreFetch();
  await rm(outDir, { recursive: true, force: true });
  delete process.env.WEB_URL;
  delete process.env.WEB_OUT_DIR;
});

const read = (rel: string) => readFile(join(outDir, rel), "utf-8");
const exists = (rel: string) =>
  read(rel).then(
    () => true,
    () => false,
  );

// --- Tests ---------------------------------------------------------------------

describe("syncWeb (end-to-end)", () => {
  test("crawls within the host and mirrors each page to a markdown file", async () => {
    restoreFetch = mockSite({
      "https://docs.example.com/": htmlPage(
        "Docs Home",
        `<h1>Welcome</h1>
         <p>See the <a href="/guide">Guide</a> and
            <a href="/docs/setup">Setup</a>, or visit
            <a href="https://other.example/x">Other</a>.</p>`,
      ),
      "https://docs.example.com/guide": htmlPage(
        "Guide",
        `<h1>Guide</h1><p>Back <a href="/docs/setup">to setup</a>.</p>`,
      ),
      "https://docs.example.com/docs/setup": htmlPage(
        "Setup",
        `<h1>Setup</h1><p>Return to the <a href="/guide">guide</a>.</p>`,
      ),
    });

    await syncWeb();

    // Every reachable same-host page is mirrored; the path mirrors the URL path.
    expect(await exists("index.md")).toBe(true);
    expect(await exists("guide.md")).toBe(true);
    expect(await exists("docs/setup.md")).toBe(true);

    const index = await read("index.md");
    // Frontmatter records the source URL and page title.
    expect(index).toContain("url: 'https://docs.example.com/'");
    expect(index).toContain("title: Docs Home");
    // Only <main> survives: nav/footer chrome is stripped before conversion.
    expect(index).toContain("# Welcome");
    expect(index).not.toContain("SITE NAVIGATION");
    expect(index).not.toContain("COPYRIGHT FOOTER");
    // Same-host links are rewritten to relative paths to the local .md files...
    expect(index).toContain("[Guide](./guide.md)");
    expect(index).toContain("[Setup](./docs/setup.md)");
    // ...while off-host links are left untouched.
    expect(index).toContain("[Other](https://other.example/x)");

    // Relative rewriting respects directory depth: setup.md sits one level down, so
    // its link to /guide resolves with a leading "../".
    expect(await read("docs/setup.md")).toContain("[guide](../guide.md)");
  });

  test("prunes pages that are no longer reachable", async () => {
    const full = {
      "https://docs.example.com/": htmlPage(
        "Home",
        `<a href="/guide">Guide</a> <a href="/docs/setup">Setup</a>`,
      ),
      "https://docs.example.com/guide": htmlPage("Guide", "<p>guide</p>"),
      "https://docs.example.com/docs/setup": htmlPage("Setup", "<p>setup</p>"),
    };
    restoreFetch = mockSite(full);
    await syncWeb();
    expect(await exists("guide.md")).toBe(true);

    // The home page drops its link to /guide, so /guide is no longer discovered.
    // Its file records that URL in frontmatter and is pruned; the rest stay.
    restoreFetch();
    restoreFetch = mockSite({
      ...full,
      "https://docs.example.com/": htmlPage(
        "Home",
        `<a href="/docs/setup">Setup</a>`,
      ),
    });
    await syncWeb();

    expect(await exists("guide.md")).toBe(false);
    expect(await exists("index.md")).toBe(true);
    expect(await exists("docs/setup.md")).toBe(true);
  });

  test("a crawl that yields zero pages skips pruning, to survive an outage", async () => {
    restoreFetch = mockSite({
      "https://docs.example.com/": htmlPage("Home", "<p>hello</p>"),
    });
    await syncWeb();
    expect(await exists("index.md")).toBe(true);

    // The whole site is unreachable (every URL 404s, including the start page).
    // Discovering nothing must not be mistaken for "everything was deleted".
    restoreFetch();
    restoreFetch = mockSite({});
    await syncWeb();
    expect(await exists("index.md")).toBe(true);
  });
});
