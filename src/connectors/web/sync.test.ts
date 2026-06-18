/**
 * End-to-end test for the web connector. Only the network (`fetch`) is stubbed; the
 * BFS crawler, content extraction, link rewriting, and filesystem I/O run against a
 * real temp dir, so each test documents one behaviour that `web:sync` guarantees.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { type FetchHandler, stubFetch } from "../../test-support/fetch.js";
import { syncWeb } from "./sync.js";

describe("syncWeb (end-to-end)", () => {
  let outDir: string;
  let respond: FetchHandler;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), "web-e2e-"));
    process.env.WEB_URL = url("/");
    process.env.WEB_OUT_DIR = outDir;
    delete process.env.WEB_INCLUDE;
    delete process.env.WEB_MAX_PAGES;
    // Each test swaps `respond`; until then, any request is a bug.
    respond = () => new Response("no response configured", { status: 500 });
    stubFetch((requestedUrl) => respond(requestedUrl));
  });

  afterEach(async () => {
    mock.restore();
    await rm(outDir, { recursive: true, force: true });
    delete process.env.WEB_URL;
    delete process.env.WEB_OUT_DIR;
  });

  test("crawls within the host and mirrors each page to a markdown file", async () => {
    respond = serveSite({
      [url("/")]: htmlPage(
        "Docs Home",
        `<h1>Welcome</h1>
         <p>See the <a href="/guide">Guide</a> and
            <a href="/docs/setup">Setup</a>, or visit
            <a href="https://other.example/x">Other</a>.</p>`,
      ),
      [url("/guide")]: htmlPage(
        "Guide",
        `<h1>Guide</h1><p>Back <a href="/docs/setup">to setup</a>.</p>`,
      ),
      [url("/docs/setup")]: htmlPage(
        "Setup",
        `<h1>Setup</h1><p>Return to the <a href="/guide">guide</a>.</p>`,
      ),
    });

    await syncWeb();

    // The local path mirrors the URL path.
    expect(await exists(outDir, "index.md")).toBe(true);
    expect(await exists(outDir, "guide.md")).toBe(true);
    expect(await exists(outDir, "docs/setup.md")).toBe(true);

    const index = await read(outDir, "index.md");
    expect(index).toContain(`url: '${url("/")}'`);
    expect(index).toContain("title: Docs Home");
    // Only <main> is kept; nav/footer chrome is stripped before conversion.
    expect(index).toContain("# Welcome");
    expect(index).not.toContain("SITE NAVIGATION");
    expect(index).not.toContain("COPYRIGHT FOOTER");
    // Same-host links become relative paths to the local .md; off-host links stay.
    expect(index).toContain("[Guide](./guide.md)");
    expect(index).toContain("[Setup](./docs/setup.md)");
    expect(index).toContain("[Other](https://other.example/x)");
    // Rewriting respects depth: setup.md is a level down, so it reaches /guide via "../".
    expect(await read(outDir, "docs/setup.md")).toContain(
      "[guide](../guide.md)",
    );
  });

  test("prunes pages that are no longer reachable", async () => {
    const site = {
      [url("/")]: htmlPage(
        "Home",
        `<a href="/guide">Guide</a> <a href="/docs/setup">Setup</a>`,
      ),
      [url("/guide")]: htmlPage("Guide", "<p>guide</p>"),
      [url("/docs/setup")]: htmlPage("Setup", "<p>setup</p>"),
    };
    respond = serveSite(site);
    await syncWeb();
    expect(await exists(outDir, "guide.md")).toBe(true);

    // Home drops its link to /guide, so /guide is no longer discovered and is pruned.
    respond = serveSite({
      ...site,
      [url("/")]: htmlPage("Home", `<a href="/docs/setup">Setup</a>`),
    });
    await syncWeb();

    expect(await exists(outDir, "guide.md")).toBe(false);
    expect(await exists(outDir, "index.md")).toBe(true);
    expect(await exists(outDir, "docs/setup.md")).toBe(true);
  });

  test("a crawl that yields zero pages skips pruning, to survive an outage", async () => {
    respond = serveSite({ [url("/")]: htmlPage("Home", "<p>hello</p>") });
    await syncWeb();
    expect(await exists(outDir, "index.md")).toBe(true);

    // The whole site is unreachable (every URL 404s); discovering nothing must not
    // be mistaken for "everything was deleted".
    respond = serveSite({});
    await syncWeb();
    expect(await exists(outDir, "index.md")).toBe(true);
  });
});

// --- Helpers -------------------------------------------------------------------

const SITE = "https://docs.example.com";
function url(path: string): string {
  return SITE + path;
}

/** Serves `site` (URL → HTML); an unknown URL 404s, which the crawler treats as gone. */
function serveSite(site: Record<string, string>): FetchHandler {
  return (requestedUrl) => {
    const html = site[requestedUrl];
    return html === undefined
      ? new Response("not found", { status: 404 })
      : new Response(html, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
  };
}

/** A full HTML doc whose nav/footer are "chrome" the connector must strip. */
function htmlPage(title: string, main: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>
    <nav>SITE NAVIGATION MENU</nav>
    <main>${main}</main>
    <footer>COPYRIGHT FOOTER</footer>
  </body></html>`;
}

function read(dir: string, rel: string): Promise<string> {
  return readFile(join(dir, rel), "utf-8");
}

function exists(dir: string, rel: string): Promise<boolean> {
  return read(dir, rel).then(
    () => true,
    () => false,
  );
}
