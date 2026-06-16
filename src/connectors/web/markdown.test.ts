import { describe, expect, test } from "bun:test";
import { makeLinkResolver } from "./discover.js";
import { htmlToMarkdown, pageTitle } from "./markdown.js";

const resolve = makeLinkResolver({
  siteHost: "docs.example.com",
  include: /^\/docs\//,
});
const from = "https://docs.example.com/docs/a";

describe("htmlToMarkdown", () => {
  test("extracts the main region and drops nav chrome", () => {
    const html = `
      <body>
        <nav><a href="/docs/skip">nav</a></nav>
        <main><h1>Title</h1><p>Body text.</p></main>
      </body>`;
    const md = htmlToMarkdown(html);
    expect(md).toMatchInlineSnapshot(`
      "# Title

      Body text."
    `);
  });

  test("rewrites links via the resolver", () => {
    const html = `<main>
      <a href="/docs/b">B</a>
      <a href="/pricing">P</a>
    </main>`;
    const md = htmlToMarkdown(html, (href) => resolve(from, href));
    expect(md).toMatchInlineSnapshot(
      `"[B](./b.md) [P](https://docs.example.com/pricing)"`,
    );
  });
});

describe("pageTitle", () => {
  test("reads and decodes the <title>", () => {
    expect(pageTitle("<title>Docs &amp; API</title>")).toBe("Docs & API");
  });
});
