/**
 * Notion API client for the sync: discovery (search + data source query) and
 * page-to-markdown export. Wraps @notionhq/client with a global rate limiter
 * (Notion allows ~3 req/s per connection) and 429/Retry-After backoff.
 */

import {
  Client,
  isFullPage,
  isFullPageOrDataSource,
  type DataSourceObjectResponse,
  type PageObjectResponse,
  type RichTextItemResponse,
} from "@notionhq/client";

/** retrieveMarkdown requires API version 2026-03-11. */
const NOTION_VERSION = "2026-03-11";

/** Minimum spacing between request starts (Notion allows ~3 req/s per token). */
const MIN_REQUEST_INTERVAL_MS = 334;
/** Stop fetching unknown block subtrees after this many passes. */
const MAX_UNKNOWN_BLOCK_PASSES = 10;

export type NotionNodeType = "page" | "data_source";

/** A Notion parent reference, normalized to a type + the referenced id. */
export type RawParent = { type: string; id: string | null };

export type NotionNode = {
  id: string;
  type: NotionNodeType;
  title: string;
  lastEditedTime: string;
  createdTime: string;
  createdById: string | null;
  lastEditedById: string | null;
  icon: string | null;
  /** Parent as Notion reports it (page_id, data_source_id, database_id, block_id, workspace, ...). */
  parent: RawParent;
  /** Resolved parent node id within the synced set, filled by enumerate(); null = root. */
  parentId: string | null;
  /** For data sources: the id of the database that contains them (to map legacy database_id row parents). */
  containerDatabaseId: string | null;
  /** Raw page property values (rows/pages); null for data sources. */
  properties: Record<string, unknown> | null;
  /** Raw schema property definitions (data sources); null for pages. */
  schema: Record<string, unknown> | null;
  /** Data source description text; null for pages. */
  description: string | null;
  url: string;
};

function rawParentOf(
  parent: { type: string } & Record<string, unknown>,
): RawParent {
  const id = parent[parent.type];
  return { type: parent.type, id: typeof id === "string" ? id : null };
}

function userId(user: unknown): string | null {
  return (user as { id?: string } | null)?.id ?? null;
}

/** Notion-uploaded media use expiring signed URLs; never persist those. */
const EXPIRING_MEDIA_HOST = /(amazonaws\.com|notion-static\.com|prod-files)/;

function iconSummary(icon: unknown): string | null {
  const i = icon as {
    type?: string;
    emoji?: string;
    external?: { url?: string };
    file?: { url?: string };
    custom_emoji?: { name?: string };
  } | null;
  if (!i) {
    return null;
  }
  if (i.type === "emoji") {
    return i.emoji ?? null;
  }
  if (i.type === "custom_emoji") {
    return i.custom_emoji?.name ?? null;
  }
  if (i.type === "external") {
    const url = i.external?.url ?? null;
    return url && EXPIRING_MEDIA_HOST.test(url) ? null : url;
  }
  return null;
}

export type PageMarkdown = {
  markdown: string;
  truncated: boolean;
};

function richText(items: RichTextItemResponse[] | undefined): string {
  return (items ?? [])
    .map((t) => t.plain_text)
    .join("")
    .trim();
}

function pageTitle(page: PageObjectResponse): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title") {
      return richText(prop.title);
    }
  }
  return "";
}

/** Stop climbing block ancestors after this many hops (cycle/runaway guard). */
const MAX_BLOCK_CLIMB = 20;

export class NotionSyncClient {
  private readonly notion: Client;
  private gate: Promise<void> = Promise.resolve();

  constructor(token: string) {
    this.notion = new Client({ auth: token, notionVersion: NOTION_VERSION });
  }

  /**
   * Space request *starts* by a fixed interval. The next slot opens a fixed
   * delay after this request fires (not after it completes), so a slow request
   * doesn't stall throughput, requests just overlap. The SDK handles 429/5xx
   * retries (honoring Retry-After) internally.
   */
  private async schedule<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.gate;
    let release!: () => void;
    this.gate = new Promise<void>((r) => (release = r));
    await prev;
    setTimeout(release, MIN_REQUEST_INTERVAL_MS);
    return fn();
  }

  /** All pages and data sources shared with the connection. */
  async listSharedNodes(
    onProgress?: (count: number) => void,
  ): Promise<NotionNode[]> {
    const nodes: NotionNode[] = [];
    let cursor: string | undefined;
    for (;;) {
      const res = await this.schedule(() =>
        this.notion.search({ start_cursor: cursor, page_size: 100 }),
      );
      for (const result of res.results) {
        if (!isFullPageOrDataSource(result)) {
          continue;
        }
        if (result.object === "page") {
          nodes.push({
            id: result.id,
            type: "page",
            title: pageTitle(result),
            lastEditedTime: result.last_edited_time,
            createdTime: result.created_time,
            createdById: userId(result.created_by),
            lastEditedById: userId(result.last_edited_by),
            icon: iconSummary(result.icon),
            parent: rawParentOf(result.parent),
            parentId: null,
            containerDatabaseId: null,
            properties: result.properties,
            schema: null,
            description: null,
            url: result.url,
          });
        } else {
          nodes.push({
            id: result.id,
            type: "data_source",
            title: richText(result.title),
            lastEditedTime: result.last_edited_time,
            createdTime: result.created_time,
            createdById: userId(result.created_by),
            lastEditedById: userId(result.last_edited_by),
            icon: iconSummary(result.icon),
            // Data sources nest under the page their database lives in.
            parent: rawParentOf(result.database_parent),
            parentId: null,
            containerDatabaseId: rawParentOf(result.parent).id,
            properties: null,
            schema: result.properties,
            description: richText(result.description),
            url: result.url,
          });
        }
      }
      onProgress?.(nodes.length);
      if (!res.has_more || !res.next_cursor) {
        break;
      }
      cursor = res.next_cursor;
    }
    return nodes;
  }

  /** Directory of workspace users: id -> { name, email }. Email present for person users. */
  async listUsers(): Promise<
    Map<string, { name: string; email: string | null }>
  > {
    const users = new Map<string, { name: string; email: string | null }>();
    let cursor: string | undefined;
    for (;;) {
      const res = await this.schedule(() =>
        this.notion.users.list({ start_cursor: cursor, page_size: 100 }),
      );
      for (const u of res.results) {
        const person = (u as { person?: { email?: string } }).person;
        users.set(u.id, { name: u.name ?? u.id, email: person?.email ?? null });
      }
      if (!res.has_more || !res.next_cursor) {
        break;
      }
      cursor = res.next_cursor;
    }
    return users;
  }

  /** Row pages of a data source (search doesn't reliably enumerate rows). */
  async listDataSourceRows(
    dataSourceId: string,
    onProgress?: (count: number) => void,
  ): Promise<NotionNode[]> {
    const rows: NotionNode[] = [];
    let cursor: string | undefined;
    for (;;) {
      const res = await this.schedule(() =>
        this.notion.dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
          page_size: 100,
        }),
      );
      for (const result of res.results) {
        if (!isFullPage(result)) {
          continue;
        }
        rows.push({
          id: result.id,
          type: "page",
          title: pageTitle(result),
          lastEditedTime: result.last_edited_time,
          createdTime: result.created_time,
          createdById: userId(result.created_by),
          lastEditedById: userId(result.last_edited_by),
          icon: iconSummary(result.icon),
          parent: { type: "data_source_id", id: dataSourceId },
          parentId: dataSourceId,
          containerDatabaseId: null,
          properties: result.properties,
          schema: null,
          description: null,
          url: result.url,
        });
      }
      onProgress?.(rows.length);
      if (!res.has_more || !res.next_cursor) {
        break;
      }
      cursor = res.next_cursor;
    }
    return rows;
  }

  /**
   * Fetch a single data source as a node. Used to pull in databases embedded in
   * shared pages (so their rows, which leak through search, can nest). Returns
   * null when the integration can't access it.
   */
  async retrieveDataSource(id: string): Promise<NotionNode | null> {
    let result: DataSourceObjectResponse;
    try {
      result = (await this.schedule(() =>
        this.notion.dataSources.retrieve({ data_source_id: id }),
      )) as DataSourceObjectResponse;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404 || status === 403) {
        return null;
      }
      throw err;
    }
    return {
      id: result.id,
      type: "data_source",
      title: richText(result.title),
      lastEditedTime: result.last_edited_time,
      createdTime: result.created_time,
      createdById: userId(result.created_by),
      lastEditedById: userId(result.last_edited_by),
      icon: iconSummary(result.icon),
      parent: rawParentOf(result.database_parent),
      parentId: null,
      containerDatabaseId: rawParentOf(result.parent).id,
      properties: null,
      schema: result.properties,
      description: richText(result.description),
      url: result.url,
    };
  }

  /**
   * Climb block ancestors until reaching a non-block parent (page, data source,
   * database, or workspace). Used to nest pages that live inside toggles/columns.
   */
  async resolveBlockContainer(blockId: string): Promise<RawParent> {
    let currentId = blockId;
    for (let i = 0; i < MAX_BLOCK_CLIMB; i++) {
      const block = await this.retrieveBlock(currentId);
      if (!block) {
        return { type: "workspace", id: null };
      }
      const parent = rawParentOf(
        (
          block as unknown as {
            parent: { type: string } & Record<string, unknown>;
          }
        ).parent,
      );
      if (parent.type === "block_id" && parent.id) {
        currentId = parent.id;
        continue;
      }
      return parent;
    }
    return { type: "workspace", id: null };
  }

  /** Inaccessible blocks 404; surface null so the caller treats the node as a root. */
  private async retrieveBlock(blockId: string) {
    try {
      return await this.schedule(() =>
        this.notion.blocks.retrieve({ block_id: blockId }),
      );
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        return null;
      }
      throw err;
    }
  }

  /** Full page content as markdown, resolving truncated/unknown block subtrees. */
  async pageMarkdown(pageId: string): Promise<PageMarkdown> {
    const first = await this.schedule(() =>
      this.notion.pages.retrieveMarkdown({ page_id: pageId }),
    );
    const parts = [first.markdown];
    let pending = first.unknown_block_ids;
    let truncated = first.truncated;
    let passes = 0;
    while (
      truncated &&
      pending.length > 0 &&
      passes < MAX_UNKNOWN_BLOCK_PASSES
    ) {
      passes += 1;
      const next: string[] = [];
      let stillTruncated = false;
      for (const blockId of pending) {
        const extra = await this.fetchUnknownBlock(blockId);
        if (!extra) {
          continue;
        }
        parts.push(extra.markdown);
        if (extra.truncated) {
          stillTruncated = true;
          next.push(...extra.unknown_block_ids);
        }
      }
      pending = next;
      truncated = stillTruncated;
    }
    return { markdown: parts.join("\n\n"), truncated };
  }

  /** Inaccessible unknown blocks 404; skip those, surface anything else. */
  private async fetchUnknownBlock(blockId: string) {
    try {
      return await this.schedule(() =>
        this.notion.pages.retrieveMarkdown({ page_id: blockId }),
      );
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        return null;
      }
      throw err;
    }
  }
}
