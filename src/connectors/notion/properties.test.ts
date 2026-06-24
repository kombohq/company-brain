import { describe, expect, test } from "bun:test";
import {
  normalizeProperties,
  normalizeValue,
  personRef,
  summarizeSchema,
  type UserDirectory,
} from "./properties.js";

const noUsers: UserDirectory = new Map();
const noRelations = (id: string) => id;
const resolveP1 = (id: string) => (id === "p1" ? "[Page](./p1.md)" : "");
const norm = (prop: unknown) =>
  normalizeValue(prop as never, noRelations, noUsers);

describe("normalizeValue", () => {
  test("title and rich_text join plain_text segments", () => {
    const title = norm({
      type: "title",
      title: [{ plain_text: "Hello " }, { plain_text: "world" }],
    });
    expect(title).toBe("Hello world");
    const richText = norm({
      type: "rich_text",
      rich_text: [{ plain_text: "note" }],
    });
    expect(richText).toBe("note");
  });

  test("empty rich text is null", () => {
    expect(norm({ type: "rich_text", rich_text: [] })).toBeNull();
  });

  test("select and status return the option name", () => {
    expect(norm({ type: "select", select: { name: "Done" } })).toBe("Done");
    const status = norm({ type: "status", status: { name: "In progress" } });
    expect(status).toBe("In progress");
  });

  test("multi_select maps to the list of names", () => {
    const value = norm({
      type: "multi_select",
      multi_select: [{ name: "a" }, { name: "b" }],
    });
    expect(value).toEqual(["a", "b"]);
  });

  test("number, checkbox, url, email, phone pass through", () => {
    expect(norm({ type: "number", number: 42 })).toBe(42);
    expect(norm({ type: "checkbox", checkbox: false })).toBe(false);
    expect(norm({ type: "url", url: "https://x.dev" })).toBe("https://x.dev");
    expect(norm({ type: "email", email: "a@b.dev" })).toBe("a@b.dev");
    expect(norm({ type: "phone_number", phone_number: "+1" })).toBe("+1");
  });

  test("date renders a single start or a start -> end range", () => {
    const start = norm({ type: "date", date: { start: "2026-01-01" } });
    expect(start).toBe("2026-01-01");
    const range = norm({
      type: "date",
      date: { start: "2026-01-01", end: "2026-02-01" },
    });
    expect(range).toBe("2026-01-01 -> 2026-02-01");
    expect(norm({ type: "date", date: null })).toBeNull();
  });

  test("people resolve through the user directory, falling back to inline name", () => {
    const users: UserDirectory = new Map([
      ["u1", { name: "Ada", email: "ada@x.dev" }],
    ]);
    const value = normalizeValue(
      {
        type: "people",
        people: [{ id: "u1" }, { id: "u2", name: "Bob" }],
      } as never,
      noRelations,
      users,
    );
    expect(value).toEqual([
      { name: "Ada", email: "ada@x.dev" },
      { name: "Bob" },
    ]);
  });

  test("files map to their names", () => {
    const value = norm({ type: "files", files: [{ name: "spec.pdf" }, {}] });
    expect(value).toEqual(["spec.pdf", "file"]);
  });

  test("relation resolves each id and drops unresolved ones", () => {
    const value = normalizeValue(
      { type: "relation", relation: [{ id: "p1" }, { id: "p2" }] } as never,
      resolveP1,
      noUsers,
    );
    expect(value).toEqual(["[Page](./p1.md)"]);
  });

  test("unique_id formats with an optional prefix", () => {
    const withPrefix = norm({
      type: "unique_id",
      unique_id: { number: 7, prefix: "TASK" },
    });
    expect(withPrefix).toBe("TASK-7");
    const withoutPrefix = norm({
      type: "unique_id",
      unique_id: { number: 7, prefix: null },
    });
    expect(withoutPrefix).toBe(7);
  });

  test("rollup unwraps number, date, and array shapes", () => {
    const number = norm({
      type: "rollup",
      rollup: { type: "number", number: 3 },
    });
    expect(number).toBe(3);
    const date = norm({
      type: "rollup",
      rollup: { type: "date", date: { start: "2026-01-01" } },
    });
    expect(date).toBe("2026-01-01");
    const array = norm({
      type: "rollup",
      rollup: {
        type: "array",
        array: [
          { type: "rich_text", rich_text: [{ plain_text: "x" }] },
          { type: "rich_text", rich_text: [] },
        ],
      },
    });
    expect(array).toEqual(["x"]);
  });

  test("formula returns the typed value", () => {
    const value = norm({
      type: "formula",
      formula: { type: "string", string: "ok" },
    });
    expect(value).toBe("ok");
  });

  test("unknown property types are null", () => {
    expect(norm({ type: "verification" })).toBeNull();
  });
});

describe("normalizeProperties", () => {
  test("keeps non-empty values and booleans, drops empties", () => {
    const out = normalizeProperties(
      {
        Name: { type: "title", title: [{ plain_text: "Task" }] },
        Tags: { type: "multi_select", multi_select: [] },
        Done: { type: "checkbox", checkbox: false },
        Notes: { type: "rich_text", rich_text: [] },
        Count: { type: "number", number: 0 },
      },
      noRelations,
      noUsers,
    );
    expect(out).toEqual({ Name: "Task", Done: false, Count: 0 });
  });

  test("skips a property with an empty name", () => {
    const out = normalizeProperties(
      { "": { type: "number", number: 1 } },
      noRelations,
      noUsers,
    );
    expect(out).toEqual({});
  });
});

describe("personRef", () => {
  test("known person resolves to name and email", () => {
    const users: UserDirectory = new Map([
      ["u1", { name: "Ada", email: "ada@x.dev" }],
    ]);
    expect(personRef("u1", null, users)).toEqual({
      name: "Ada",
      email: "ada@x.dev",
    });
  });

  test("known bot (no email) resolves to name only", () => {
    const users: UserDirectory = new Map([
      ["b1", { name: "Bot", email: null }],
    ]);
    expect(personRef("b1", null, users)).toEqual({ name: "Bot" });
  });

  test("unknown id falls back to inline name, then to the bare id", () => {
    expect(personRef("u9", "Inline", noUsers)).toEqual({ name: "Inline" });
    expect(personRef("u9", null, noUsers)).toEqual({ id: "u9" });
  });

  test("no id and no fallback is null", () => {
    expect(personRef(null, null, noUsers)).toBeNull();
  });
});

describe("summarizeSchema", () => {
  test("lists option names for select-like columns and bare type otherwise", () => {
    const summary = summarizeSchema({
      Status: {
        type: "select",
        select: { options: [{ name: "Todo" }, { name: "Done" }] },
      },
      Title: { type: "title", title: {} },
    });
    expect(summary).toEqual({
      Status: "select (options: Todo, Done)",
      Title: "title",
    });
  });
});
