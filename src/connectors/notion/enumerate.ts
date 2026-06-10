/**
 * Enumerate every page + data source shared with the connection and resolve each
 * node's parent into an id within the set, so the on-disk tree mirrors Notion.
 *
 * Resolution rules:
 * - page_id / data_source_id parents -> that node (if present in the set)
 * - database_id parents (legacy row shape) -> the data source of that database
 * - block_id parents (pages inside toggles/columns) -> climb to the container page
 * - workspace / unresolved -> root
 */

import type {
  NotionNode,
  NotionSyncClient,
  RawParent,
} from "./notion-client.js";

const log = (msg: string) => console.error(`[notion] ${msg}`);
const since = (t: number) => `${((Date.now() - t) / 1000).toFixed(1)}s`;

// A row whose database couldn't be resolved (e.g. no integration access) would
// land at the top level; drop those rather than litter the root with orphans.
const isOrphanRow = (n: NotionNode) =>
  (n.parent.type === "data_source_id" || n.parent.type === "database_id") &&
  n.parentId === null;

export async function enumerate(
  client: NotionSyncClient,
): Promise<NotionNode[]> {
  log("searching for shared pages and data sources...");
  const tSearch = Date.now();
  const shared = await client.listSharedNodes((n) => {
    if (n % 500 === 0) {
      log(`  search: ${n} node(s) so far...`);
    }
  });
  const dataSources = shared.filter((n) => n.type === "data_source");
  log(
    `search returned ${shared.length} shared node(s) (${shared.length - dataSources.length} page(s), ${dataSources.length} data source(s)) in ${since(tSearch)}`,
  );

  const byId = new Map<string, NotionNode>(shared.map((n) => [n.id, n]));
  const tRows = Date.now();
  let totalRows = 0;
  for (const [i, ds] of dataSources.entries()) {
    const rows = await client.listDataSourceRows(ds.id, (n) => {
      if (n % 500 === 0) {
        log(`    "${ds.title || "untitled"}": ${n} row(s) so far...`);
      }
    });
    // The query result is fresher than search (whose index lags), so let it win
    // on last_edited_time and avoid skipping an incremental refetch.
    for (const row of rows) {
      byId.set(row.id, row);
    }
    totalRows += rows.length;
    log(
      `queried data source ${i + 1}/${dataSources.length} ("${ds.title || "untitled"}"): ${rows.length} row(s) [${totalRows} total]`,
    );
  }
  log(
    `queried ${dataSources.length} data source(s): ${totalRows} row(s) in ${since(tRows)}`,
  );

  // Rows of databases embedded inside shared pages leak through search but the
  // database itself doesn't. Pull those data sources in so the rows nest under
  // them (and the database under its container page) instead of going top-level.
  const missingDataSourceIds = (): string[] => {
    const ids = new Set<string>();
    for (const n of byId.values()) {
      if (
        n.parent.type === "data_source_id" &&
        n.parent.id &&
        !byId.has(n.parent.id)
      ) {
        ids.add(n.parent.id);
      }
    }
    return [...ids];
  };
  const attempted = new Set<string>();
  let pulled = 0;
  const tPull = Date.now();
  for (;;) {
    const missing = missingDataSourceIds().filter((id) => !attempted.has(id));
    if (missing.length === 0) {
      break;
    }
    log(`pulling in ${missing.length} embedded data source(s)...`);
    for (const dsId of missing) {
      attempted.add(dsId);
      const ds = await client.retrieveDataSource(dsId);
      if (ds) {
        byId.set(ds.id, ds);
        pulled += 1;
      }
    }
  }
  if (pulled > 0) {
    log(`pulled in ${pulled} embedded data source(s) in ${since(tPull)}`);
  }

  const nodes = [...byId.values()];
  const databaseToDataSource = new Map<string, string>();
  for (const n of nodes) {
    if (n.type === "data_source" && n.containerDatabaseId) {
      databaseToDataSource.set(n.containerDatabaseId, n.id);
    }
  }

  const blockParented = nodes.filter(
    (n) => n.parent.type === "block_id",
  ).length;
  if (blockParented > 0) {
    log(
      `resolving ${blockParented} block-nested page(s) to their container (one API call each)...`,
    );
  }
  const tBlocks = Date.now();
  let resolvedBlocks = 0;

  const blockCache = new Map<string, RawParent>();
  const resolve = async (parent: RawParent): Promise<string | null> => {
    if (!parent.id) {
      return null;
    }
    switch (parent.type) {
      case "page_id":
      case "data_source_id":
        return byId.has(parent.id) ? parent.id : null;
      case "database_id":
        return databaseToDataSource.get(parent.id) ?? null;
      case "block_id": {
        let container = blockCache.get(parent.id);
        if (!container) {
          container = await client.resolveBlockContainer(parent.id);
          blockCache.set(parent.id, container);
        }
        return resolve(container);
      }
      default:
        return null;
    }
  };

  for (const node of nodes) {
    if (node.parent.type === "block_id") {
      resolvedBlocks += 1;
      if (resolvedBlocks % 20 === 0) {
        log(
          `  resolved ${resolvedBlocks}/${blockParented} block-nested page(s)`,
        );
      }
    }
    node.parentId = await resolve(node.parent);
  }
  if (blockParented > 0) {
    log(`resolved ${blockParented} block-nested page(s) in ${since(tBlocks)}`);
  }

  const kept = nodes.filter((n) => !isOrphanRow(n));
  const dropped = nodes.length - kept.length;
  if (dropped > 0) {
    log(`dropped ${dropped} unresolvable orphan row(s)`);
  }

  const roots = kept.filter((n) => n.parentId === null).length;
  log(`enumerated ${kept.length} node(s); ${roots} at top level`);
  return kept;
}
