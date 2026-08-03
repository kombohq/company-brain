import { describe, expect, test } from "bun:test";
import type { NotionNode } from "./notion-client.js";
import {
  bodyOf,
  computePaths,
  parseFrontmatter,
  sanitizeBody,
  serializePage,
  shortId,
  slugify,
} from "./markdown.js";
import type { UserDirectory } from "./properties.js";

const noUsers: UserDirectory = new Map();
const keepRelation = (id: string) => id;

describe("slugify", () => {
  test("lowercases, strips accents, and dashes separators", () => {
    expect(slugify("Héllo, World!")).toBe("hello-world");
  });

  test("falls back to untitled when nothing remains", () => {
    expect(slugify("---")).toBe("untitled");
  });
});

describe("shortId", () => {
  test("drops dashes and takes the first eight chars", () => {
    expect(shortId("12345678-90ab-cdef-1234-567890abcdef")).toBe("12345678");
  });
});

describe("computePaths", () => {
  test("nests a child folder under its parent, each with its own index.md", () => {
    const parent = makeNode({
      id: "aaaaaaaa-0000-0000-0000-000000000000",
      title: "Parent",
    });
    const child = makeNode({
      id: "bbbbbbbb-0000-0000-0000-000000000000",
      title: "Child",
      parentId: parent.id,
    });
    const paths = computePaths([parent, child]);
    expect(paths.get(parent.id)).toBe("parent-aaaaaaaa/index.md");
    expect(paths.get(child.id)).toBe("parent-aaaaaaaa/child-bbbbbbbb/index.md");
  });

  test("a parent outside the set makes the node a root", () => {
    const orphan = makeNode({
      id: "cccccccc-0000-0000-0000-000000000000",
      title: "Orphan",
      parentId: "missing",
    });
    const path = computePaths([orphan]).get(orphan.id);
    expect(path).toBe("orphan-cccccccc/index.md");
  });
});

describe("sanitizeBody", () => {
  test("rewrites a page reference to a resolved local link", () => {
    const id = "1234567890abcdef1234567890abcdef";
    const md = sanitizeBody(`<page url="https://notion.so/${id}">Docs</page>`, {
      link: (notionId) => (notionId === id ? "./docs/index.md" : null),
    });
    expect(md).toBe("[Docs](./docs/index.md)");
  });

  test("resolves a user mention through the resolver", () => {
    const md = sanitizeBody(`<mention-user url="user://u1" />`, {
      user: (uid) => (uid === "u1" ? "Ada" : null),
    });
    expect(md).toBe("@Ada");
  });

  test("collapses a date mention range into an arrow", () => {
    const md = sanitizeBody(
      `<mention-date start="2026-01-01" end="2026-02-01" />`,
    );
    expect(md).toBe("2026-01-01 -> 2026-02-01");
  });

  test("replaces an expiring media image with a placeholder", () => {
    const md = sanitizeBody("![chart](https://prod-files.notion.so/x.png)");
    expect(md).toBe("[image: chart]");
  });

  test("strips toggle annotations from headings", () => {
    expect(sanitizeBody(`## Section {toggle="true"}`)).toBe("## Section");
  });

  test("collapses runs of blank lines", () => {
    expect(sanitizeBody("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("serializePage", () => {
  test("writes frontmatter, properties, and the sanitized body", () => {
    const n = makeNode({
      id: "11111111-2222-3333-4444-555555555555",
      title: "Quarterly plan",
      icon: "📋",
      properties: {
        Status: { type: "select", select: { name: "Active" } },
        Owner: { type: "rich_text", rich_text: [{ plain_text: "Ada" }] },
      },
    });
    const md = serializePage(n, "## Goals\n\nShip it.", keepRelation, noUsers);
    expect(md).toMatchInlineSnapshot(`
      "---
      notion_id: 11111111-2222-3333-4444-555555555555
      title: Quarterly plan
      type: page
      last_edited_time: '2026-02-01T00:00:00.000Z'
      created_time: '2026-01-01T00:00:00.000Z'
      created_by: null
      last_edited_by: null
      icon: "\\U0001F4CB"
      parent_id: null
      url: 'https://notion.so/x'
      properties:
        Status: Active
        Owner: Ada
      ---

      ## Goals

      Ship it.
      "
    `);
  });

  test("flags a truncated page in frontmatter", () => {
    const n = makeNode({
      id: "99999999-0000-0000-0000-000000000000",
      title: "Big",
    });
    const md = serializePage(n, "body", keepRelation, noUsers, undefined, true);
    expect(md).toContain("truncated: true");
  });

  test("data source schema is summarized into frontmatter", () => {
    const n = makeNode({
      id: "dddddddd-0000-0000-0000-000000000000",
      type: "data_source",
      title: "Tasks",
      schema: {
        Stage: {
          type: "select",
          select: { options: [{ name: "Todo" }, { name: "Done" }] },
        },
      },
      description: "All tasks",
    });
    const md = serializePage(n, "", keepRelation, noUsers);
    expect(md).toContain("Stage: 'select (options: Todo, Done)'");
    expect(md).toContain("description: All tasks");
  });
});

describe("parseFrontmatter", () => {
  test("round-trips notion_id and last_edited_time from a serialized page", () => {
    const n = makeNode({
      id: "abcdef00-1111-2222-3333-444444444444",
      title: "Doc",
      lastEditedTime: "2026-03-01T12:00:00.000Z",
    });
    const md = serializePage(n, "hi", keepRelation, noUsers);
    expect(parseFrontmatter(md)).toEqual({
      notionId: "abcdef00-1111-2222-3333-444444444444",
      lastEditedTime: "2026-03-01T12:00:00.000Z",
    });
  });

  test("returns null when the markers are missing", () => {
    expect(parseFrontmatter("# just markdown")).toBeNull();
  });
});

describe("bodyOf", () => {
  test("returns the body with frontmatter stripped", () => {
    const n = makeNode({
      id: "eeeeeeee-0000-0000-0000-000000000000",
      title: "Doc",
    });
    const md = serializePage(n, "Hello body.", keepRelation, noUsers);
    expect(bodyOf(md).trim()).toBe("Hello body.");
  });
});

function makeNode(
  overrides: Partial<NotionNode> & Pick<NotionNode, "id">,
): NotionNode {
  return {
    type: "page",
    title: "Untitled",
    lastEditedTime: "2026-02-01T00:00:00.000Z",
    createdTime: "2026-01-01T00:00:00.000Z",
    createdById: null,
    lastEditedById: null,
    icon: null,
    parent: { type: "workspace", id: null },
    parentId: null,
    containerDatabaseId: null,
    properties: null,
    schema: null,
    description: null,
    url: "https://notion.so/x",
    ...overrides,
  };
}
