/**
 * Normalize Notion page property values and database schema definitions into
 * readable, frontmatter-friendly shapes. People resolve to names, relations to
 * linked page titles, selects/status to labels, rollups/formulas to their value.
 */

type RichText = { plain_text?: string };
type Prop = { type: string } & Record<string, any>;

/** id -> `[title](relative-path)` link (or bare title if the target isn't synced). */
export type RelationResolver = (id: string) => string;

/** id -> { name, email } for workspace users. */
export type UserDirectory = Map<string, { name: string; email: string | null }>;

export type PersonRef =
  | { name: string; email: string }
  | { name: string }
  | { id: string };

/** Turn a user id (with optional inline name fallback) into a { name, email } object. */
export function personRef(
  id: string | null,
  fallbackName: string | null,
  users: UserDirectory,
): PersonRef | null {
  if (!id) {
    return fallbackName ? { name: fallbackName } : null;
  }
  const u = users.get(id);
  if (u?.email) {
    return { name: u.name, email: u.email };
  }
  if (u) {
    return { name: u.name };
  }
  return fallbackName ? { name: fallbackName } : { id };
}

function plain(rich: RichText[] | undefined): string {
  return (rich ?? [])
    .map((r) => r.plain_text ?? "")
    .join("")
    .trim();
}

function isEmpty(v: unknown): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

function normalizeRollup(
  rollup: Prop,
  resolve: RelationResolver,
  users: UserDirectory,
): unknown {
  if (rollup.type === "number") {
    return rollup.number ?? null;
  }
  if (rollup.type === "date") {
    return rollup.date?.start ?? null;
  }
  if (rollup.type === "array") {
    const items = (rollup.array as Prop[])
      .map((el) => normalizeValue(el, resolve, users))
      .filter((v) => !isEmpty(v));
    return items.length ? items : null;
  }
  return null;
}

export function normalizeValue(
  prop: Prop,
  resolve: RelationResolver,
  users: UserDirectory,
): unknown {
  switch (prop.type) {
    case "title":
    case "rich_text":
      return plain(prop[prop.type]) || null;
    case "select":
      return prop.select?.name ?? null;
    case "status":
      return prop.status?.name ?? null;
    case "multi_select":
      return (prop.multi_select as { name: string }[]).map((o) => o.name);
    case "number":
      return prop.number ?? null;
    case "checkbox":
      return prop.checkbox;
    case "url":
      return prop.url ?? null;
    case "email":
      return prop.email ?? null;
    case "phone_number":
      return prop.phone_number ?? null;
    case "date":
      if (!prop.date) {
        return null;
      }
      return prop.date.end
        ? `${prop.date.start} -> ${prop.date.end}`
        : prop.date.start;
    case "people":
      return (prop.people as { name?: string; id: string }[]).map((u) =>
        personRef(u.id, u.name ?? null, users),
      );
    case "created_by":
      return personRef(
        prop.created_by?.id ?? null,
        prop.created_by?.name ?? null,
        users,
      );
    case "last_edited_by":
      return personRef(
        prop.last_edited_by?.id ?? null,
        prop.last_edited_by?.name ?? null,
        users,
      );
    case "created_time":
      return prop.created_time ?? null;
    case "last_edited_time":
      return prop.last_edited_time ?? null;
    case "files":
      return (prop.files as { name?: string }[]).map((f) => f.name ?? "file");
    case "relation":
      return (prop.relation as { id: string }[])
        .map((r) => resolve(r.id))
        .filter((v) => v !== "");
    case "unique_id":
      if (!prop.unique_id) {
        return null;
      }
      return prop.unique_id.prefix
        ? `${prop.unique_id.prefix}-${prop.unique_id.number}`
        : prop.unique_id.number;
    case "rollup":
      return normalizeRollup(prop.rollup, resolve, users);
    case "formula":
      return prop.formula?.[prop.formula?.type] ?? null;
    default:
      return null;
  }
}

/** All non-empty property values, keyed by property name. */
export function normalizeProperties(
  properties: Record<string, unknown>,
  resolve: RelationResolver,
  users: UserDirectory,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(properties)) {
    if (!name) {
      continue;
    }
    const value = normalizeValue(raw as Prop, resolve, users);
    if (typeof value === "boolean" || !isEmpty(value)) {
      out[name] = value;
    }
  }
  return out;
}

/** Schema as `column name -> "type"` or `"type (options: a, b)"` for select-like columns. */
export function summarizeSchema(
  schema: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, raw] of Object.entries(schema)) {
    const def = raw as Prop;
    const optionSource = def[def.type] as
      | { options?: { name: string }[] }
      | undefined;
    const options = optionSource?.options?.map((o) => o.name);
    out[name] = options?.length
      ? `${def.type} (options: ${options.join(", ")})`
      : def.type;
  }
  return out;
}
