import { describe, expect, test } from "bun:test";
import { makeLinkResolver, normalizeUrl, relPathForUrl } from "./discover.js";

describe("normalizeUrl", () => {
  test("drops trailing slash, hash, and query", () => {
    expect(normalizeUrl("https://h.com/a/?q=1#x")).toBe("https://h.com/a");
  });

  test("keeps root as /", () => {
    expect(normalizeUrl("https://h.com/")).toBe("https://h.com/");
  });

  test("resolves against a base", () => {
    expect(normalizeUrl("/a", "https://h.com/b/c")).toBe("https://h.com/a");
  });

  test("rejects non-http schemes", () => {
    expect(normalizeUrl("mailto:a@b.com")).toBeNull();
  });
});

describe("relPathForUrl", () => {
  test("maps paths to flat .md files", () => {
    expect(relPathForUrl("https://h.com/")).toBe("index.md");
    expect(relPathForUrl("https://h.com/pricing")).toBe("pricing.md");
    expect(relPathForUrl("https://h.com/docs/getting-started")).toBe(
      "docs/getting-started.md",
    );
  });
});

describe("makeLinkResolver", () => {
  const resolve = makeLinkResolver({
    siteHost: "docs.example.com",
    include: /^\/docs\//,
  });
  const from = "https://docs.example.com/docs/a";

  test("rewrites same-host pages matching the spec to a relative .md", () => {
    expect(resolve(from, "/docs/b")).toBe("./b.md");
    expect(resolve(from, "../docs/sub/c")).toBe("./sub/c.md");
  });

  test("keeps the full URL for same-host pages outside the spec", () => {
    expect(resolve(from, "/pricing")).toBe("https://docs.example.com/pricing");
  });

  test("keeps the full URL (with query) for other hosts", () => {
    expect(resolve(from, "https://other.com/x?y=1")).toBe(
      "https://other.com/x?y=1",
    );
  });

  test("leaves same-page anchors and non-http hrefs untouched", () => {
    expect(resolve(from, "#section")).toBeNull();
    expect(resolve(from, "mailto:a@b.com")).toBeNull();
  });

  test("without an include filter every same-host page is local", () => {
    const all = makeLinkResolver({ siteHost: "docs.example.com" });
    expect(all(from, "/pricing")).toBe("../pricing.md");
  });
});
