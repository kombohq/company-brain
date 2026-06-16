/**
 * Breadth-first crawl within the start URL's host, collecting the pages to sync.
 * Each fetched URL is either a sitemap (its <loc> entries are followed) or a page
 * (saved, and its <a href> links followed); both feed the same queue, so a start
 * URL can be a normal page or a sitemap with no special handling. An optional
 * include regex (tested against the path) narrows what is crawled and kept.
 */

import { posix } from "path";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

export type DiscoverConfig = {
  startUrl: string;
  include?: RegExp;
  maxPages: number;
};

/** origin + path without a trailing slash, so "/docs" and "/docs/" are one page. */
export function normalizeUrl(input: string, base?: string): string | null {
  const url = base ? new URL(input, base) : new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

/** Flat mirror of the URL path: "/" -> "index.md", "/docs/x" -> "docs/x.md". */
export function relPathForUrl(url: string): string {
  const path = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
  if (!path) {
    return "index.md";
  }
  const safe = path
    .split("/")
    .map((segment) => decodeURIComponent(segment).replace(/[^\w.-]+/g, "-"))
    .join("/");
  return `${safe}.md`;
}

/**
 * Builds a link rewriter for a given site: a link from `from` to a same-host page
 * matching `include` resolves to a relative path to that page's local .md (assumed
 * to exist in a full sync); anything else returns its full URL, and same-page
 * anchors or non-http schemes return null so the original href is kept.
 */
export function makeLinkResolver(opts: { siteHost: string; include?: RegExp }) {
  const isLocalPage = (url: string) =>
    new URL(url).host === opts.siteHost &&
    (!opts.include || opts.include.test(new URL(url).pathname));

  return (from: string, href: string): string | null => {
    let absolute: URL;
    try {
      absolute = new URL(href, from);
    } catch {
      return null;
    }
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") {
      return null;
    }
    const target = normalizeUrl(absolute.href)!;
    if (target === from) {
      return null;
    }
    if (!isLocalPage(target)) {
      return absolute.href;
    }
    const rel = posix.relative(
      posix.dirname(relPathForUrl(from)),
      relPathForUrl(target),
    );
    return rel.startsWith(".") ? rel : `./${rel}`;
  };
}

type HttpResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
};

async function httpGet(url: string): Promise<HttpResponse> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    body: res.ok ? await res.text() : "",
  };
}

function isSitemap(body: string): boolean {
  return /<(?:urlset|sitemapindex)\b/i.test(body);
}

/** Links out of a response: <loc> for sitemaps, <a href> for pages. */
function linksFrom(body: string, sitemap: boolean): string[] {
  const pattern = sitemap
    ? /<loc>\s*([\s\S]*?)\s*<\/loc>/gi
    : /<a\b[^>]*\shref=["']([^"']+)["']/gi;
  return [...body.matchAll(pattern)].map((m) => m[1].trim());
}

export type Page = { url: string; body: string };

/**
 * Crawls the source and yields each page's HTML as it is fetched, so the caller
 * can write pages one at a time instead of buffering the whole site in memory.
 * URLs that fail with a non-404 error are added to `failed` so the caller can
 * keep their existing files instead of pruning them on a transient outage.
 */
export async function* crawl(
  config: DiscoverConfig,
  failed: Set<string>,
): AsyncGenerator<Page> {
  const start = normalizeUrl(config.startUrl);
  if (!start) {
    throw new Error(`Invalid start URL: ${config.startUrl}`);
  }
  const host = new URL(start).host;
  const matches = (url: string) =>
    !config.include || config.include.test(new URL(url).pathname);

  const queued = new Set([start]);
  const queue = [start];
  let kept = 0;

  while (queue.length) {
    const url = queue.shift()!;
    let res: HttpResponse;
    try {
      res = await httpGet(url);
    } catch (err) {
      // Network error, not a definitive "gone": keep any existing file.
      failed.add(url);
      console.warn(`  keep ${url}: ${(err as Error).message}`);
      continue;
    }
    if (res.status === 404) {
      console.warn(`  gone ${url}: 404`);
      continue;
    }
    if (!res.ok) {
      failed.add(url);
      console.warn(`  keep ${url}: ${res.status} ${res.statusText}`);
      continue;
    }

    const sitemap = isSitemap(res.body);
    if (!sitemap && matches(url)) {
      kept += 1;
      if (kept > config.maxPages) {
        throw new Error(
          `Found more than WEB_MAX_PAGES=${config.maxPages} pages; ` +
            `raise the cap (or tighten WEB_INCLUDE) to sync the whole source.`,
        );
      }
      yield { url, body: res.body };
    }
    for (const link of linksFrom(res.body, sitemap)) {
      const next = normalizeUrl(link, url);
      if (!next || queued.has(next) || new URL(next).host !== host) {
        continue;
      }
      // Always follow nested sitemaps; only follow pages matching the filter.
      if (next.endsWith(".xml") || matches(next)) {
        queued.add(next);
        queue.push(next);
      }
    }
  }
}
