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

  test("converts a table with a header row to a pipe table", () => {
    const html = `<main><table>
      <thead><tr><th>Field</th><th>Notes</th></tr></thead>
      <tbody>
        <tr><td>id</td><td>unique</td></tr>
        <tr><td>name</td><td></td></tr>
      </tbody>
    </table></main>`;
    expect(htmlToMarkdown(html)).toMatchInlineSnapshot(`
      "| Field | Notes |
      | --- | --- |
      | id | unique |
      | name |  |"
    `);
  });

  test("flattens newlines inside a cell so the row stays intact", () => {
    const html = `<main><table>
      <thead><tr><th>Key</th><th>Detail</th></tr></thead>
      <tbody><tr><td>roles</td><td><p>Two roles:</p><ul><li>admin</li><li>user</li></ul></td></tr></tbody>
    </table></main>`;
    expect(htmlToMarkdown(html)).toMatchInlineSnapshot(`
      "| Key | Detail |
      | --- | --- |
      | roles |   Two roles:  *   admin *   user   |"
    `);
  });

  test("keeps a headerless table as HTML", () => {
    const html = `<main><table><tbody>
      <tr><td>a</td><td>b</td></tr>
      <tr><td>c</td><td>d</td></tr>
    </tbody></table></main>`;
    expect(htmlToMarkdown(html)).toMatchInlineSnapshot(
      `"<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>"`,
    );
  });
});

describe("pageTitle", () => {
  test("reads and decodes the <title>", () => {
    expect(pageTitle("<title>Docs &amp; API</title>")).toBe("Docs & API");
  });
});
