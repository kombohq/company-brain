import { describe, expect, test } from "bun:test";
import { idOf, serializeArticle } from "./markdown.js";

describe("serializeArticle", () => {
  test("writes frontmatter and converts the HTML body", () => {
    const md = serializeArticle({
      id: 42,
      title: "Connecting an integration",
      html_url: "https://acme.zendesk.com/hc/en-us/articles/42",
      locale: "en-us",
      section_id: 7,
      label_names: ["setup", "oauth"],
      created_at: "2025-01-01T00:00:00Z",
      edited_at: "2025-02-01T00:00:00Z",
      body: "<h2>Steps</h2><p>Click <strong>Connect</strong>.</p>",
    });
    expect(md).toMatchInlineSnapshot(`
      "---
      zendesk_id: 42
      title: Connecting an integration
      url: 'https://acme.zendesk.com/hc/en-us/articles/42'
      locale: en-us
      section_id: 7
      labels:
        - setup
        - oauth
      created_at: '2025-01-01T00:00:00Z'
      updated_at: '2025-02-01T00:00:00Z'
      ---

      ## Steps

      Click **Connect**.
      "
    `);
  });

  test("converts an HTML table to a pipe table", () => {
    const md = serializeArticle({
      id: 1,
      title: "t",
      body: "<table><thead><tr><th>Field</th><th>Notes</th></tr></thead><tbody><tr><td>id</td><td>unique</td></tr></tbody></table>",
    });
    expect(md).toContain("| Field | Notes |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| id | unique |");
  });

  test("idOf round-trips the stored id", () => {
    const md = serializeArticle({ id: 99, title: "x", body: "<p>y</p>" });
    expect(idOf(md)).toBe(99);
  });

  test("idOf returns null for a file without the marker", () => {
    expect(idOf("# just markdown")).toBeNull();
  });
});
