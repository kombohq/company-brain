/**
 * Markdown file helpers: YAML frontmatter (read/write via gray-matter), slugs,
 * and the hierarchical path each Notion node maps to on disk.
 */

import matter from "gray-matter";
import type { NotionNode } from "./notion-client.js";
import {
  normalizeProperties,
  personRef,
  summarizeSchema,
  type RelationResolver,
  type UserDirectory,
} from "./properties.js";

const MAX_SLUG_LEN = 80;

export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LEN)
    .replace(/-+$/g, "");
  return slug || "untitled";
}

export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

function segment(node: NotionNode): string {
  return `${slugify(node.title)}-${shortId(node.id)}`;
}

/**
 * Map every node to its relative path under the output dir. Every node is a
 * folder with its own index.md, so children always nest beneath their parent
 * and a page never flips form between syncs. Parents outside the set make it a root.
 */
export function computePaths(nodes: NotionNode[]): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const ancestorsOf = (node: NotionNode): NotionNode[] => {
    const chain: NotionNode[] = [];
    const seen = new Set<string>([node.id]);
    let current = node.parentId ? byId.get(node.parentId) : undefined;
    while (current && !seen.has(current.id)) {
      chain.unshift(current);
      seen.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return chain;
  };

  const paths = new Map<string, string>();
  for (const node of nodes) {
    const dirs = ancestorsOf(node).map(segment);
    paths.set(node.id, [...dirs, segment(node), "index.md"].join("/"));
  }
  return paths;
}

/** Replace expiring Notion-hosted media/file links with stable placeholders. */
const NOTION_MEDIA_HOST = /(amazonaws\.com|notion-static\.com|prod-files)/;

const IMAGE_WITH_NESTED_ALT =
  /!\[((?:[^[\]]|\[[^\]]*\]\([^)]*\))*)\]\((https?:\/\/[^)]+)\)/g;

/** Resolvers used to turn Notion references into local links / readable text. */
export type BodyResolvers = {
  /** Notion id -> link target relative to the current file. */
  link?: (notionId: string) => string | null;
  /** Notion id -> page title. */
  title?: (notionId: string) => string | null;
  /** Notion user id -> display name. */
  user?: (userId: string) => string | null;
};

function notionIdFromUrl(url: string): string | null {
  return url.match(/[0-9a-f]{32}/i)?.[0] ?? null;
}

/**
 * Clean Notion's extended-markdown noise out of a page body: strip expiring
 * media URLs and the cosmetic block annotations retrieveMarkdown emits (heading
 * `{toggle="true"}` suffixes, empty callouts, `<empty-block/>` spacers), and
 * rewrite `<page>`/`<database>` references to local files when we have them.
 */
export function sanitizeBody(
  body: string,
  resolvers: BodyResolvers = {},
): string {
  const href = (url: string): string => {
    const id = notionIdFromUrl(url);
    return (id && resolvers.link?.(id)) || url;
  };
  return body
    .replace(IMAGE_WITH_NESTED_ALT, (full, alt, url) =>
      NOTION_MEDIA_HOST.test(url)
        ? alt
          ? `[image: ${alt}]`
          : "[image]"
        : full,
    )
    .replace(/<file\b[^>]*\/>/g, "[file]")
    .replace(/<file\b[^>]*>[\s\S]*?<\/file>/g, "[file]")
    .replace(
      /<page\s+url="([^"]+)"\s*>([\s\S]*?)<\/page>/g,
      (_full, url, label) =>
        `[${(label as string).trim() || "page"}](${href(url)})`,
    )
    .replace(
      /<database\s+url="([^"]+)"[^>]*>(?:\s*<\/database>)?/g,
      (_full, url) => `[database](${href(url)})`,
    )
    .replace(
      /<unknown\s+url="([^"]+)"(?:\s+alt="([^"]*)")?\s*\/?>/g,
      (_full, url, alt) => `[${(alt as string) || "link"}](${href(url)})`,
    )
    .replace(
      /<video\s+(?:src|url)="([^"]+)"\s*\/?>(?:\s*<\/video>)?/g,
      (_full, url) => `[video](${url})`,
    )
    .replace(
      /<mention-user\s+url="user:\/\/([^"]+)"\s*\/?>/g,
      (_full, id) => `@${resolvers.user?.(id) ?? "user"}`,
    )
    .replace(
      /<mention-page\s+url="([^"]+)"\s*(?:\/>|>([\s\S]*?)<\/mention-page>)/g,
      (_full, url, label) => {
        const id = notionIdFromUrl(url);
        const text =
          (label as string)?.trim() || (id && resolvers.title?.(id)) || "page";
        return `[${text}](${href(url)})`;
      },
    )
    .replace(
      /<mention-date\s+start="([^"]+)"(?:\s+end="([^"]+)")?\s*\/?>/g,
      (_full, start, end) => (end ? `${start} -> ${end}` : start),
    )
    .replace(/^(#{1,6} .*?)\s*\{[^}]*\}\s*$/gm, "$1")
    .replace(/<callout\b[^>]*>\s*<\/callout>/g, "")
    .replace(/<\/?callout\b[^>]*>/g, "")
    .replace(/<\/?span\b[^>]*>/g, "")
    .replace(/<\/?columns?\b[^>]*>/g, "")
    .replace(/<table_of_contents\b[^>]*\/?>/g, "")
    .replace(/<empty-block\s*\/>/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

export function serializePage(
  node: NotionNode,
  body: string,
  resolveRelation: RelationResolver,
  users: UserDirectory,
  resolvers?: BodyResolvers,
  truncated = false,
): string {
  const frontmatter: Record<string, unknown> = {
    notion_id: node.id,
    title: node.title,
    type: node.type,
    last_edited_time: node.lastEditedTime,
    created_time: node.createdTime,
    created_by: personRef(node.createdById, null, users),
    last_edited_by: personRef(node.lastEditedById, null, users),
    icon: node.icon,
    parent_id: node.parentId ?? null,
    url: node.url,
  };
  if (truncated) {
    frontmatter.truncated = true;
  }
  if (node.properties) {
    frontmatter.properties = normalizeProperties(
      node.properties,
      resolveRelation,
      users,
    );
  }
  if (node.schema) {
    frontmatter.schema = summarizeSchema(node.schema);
    if (node.description) {
      frontmatter.description = node.description;
    }
  }
  return matter.stringify(
    `\n${sanitizeBody(body, resolvers).trim()}\n`,
    frontmatter,
  );
}

export type ParsedFrontmatter = {
  notionId: string;
  lastEditedTime: string;
};

export function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const { data } = matter(content);
  if (
    typeof data.notion_id !== "string" ||
    typeof data.last_edited_time !== "string"
  ) {
    return null;
  }
  return { notionId: data.notion_id, lastEditedTime: data.last_edited_time };
}

/** The markdown body of a stored page (frontmatter stripped). */
export function bodyOf(content: string): string {
  return matter(content).content;
}
