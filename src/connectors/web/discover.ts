/**
 * Breadth-first crawl within the start URL's host, collecting the pages to sync.
 * Each fetched URL is either a sitemap (its <loc> entries are followed) or a page
 * (saved, and its <a href> links followed); both feed the same queue, so a start
 * URL can be a normal page or a sitemap with no special handling. An optional
 * include regex (tested against the path) narrows what is crawled and kept.
 */

const USER_AGENT = "company-brain-web-sync";

export type DiscoverConfig = {
  startUrl: string;
  include?: RegExp;
  maxPages: number;
};

/** origin + path without a trailing slash, so "/docs" and "/docs/" are one page. */
function normalizeUrl(input: string, base?: string): string | null {
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

/**
 * Returns the page URLs to sync, the HTML fetched for each (so callers avoid
 * refetching), and URLs that failed with a non-404 error so callers can keep
 * their existing files instead of pruning them on a transient outage.
 */
export async function discover(config: DiscoverConfig): Promise<{
  urls: string[];
  html: Map<string, string>;
  failed: Set<string>;
}> {
  const start = normalizeUrl(config.startUrl);
  if (!start) {
    throw new Error(`Invalid start URL: ${config.startUrl}`);
  }
  const host = new URL(start).host;
  const matches = (url: string) =>
    !config.include || config.include.test(new URL(url).pathname);

  const html = new Map<string, string>();
  const failed = new Set<string>();
  const kept: string[] = [];
  const queued = new Set([start]);
  const queue = [start];

  while (queue.length && kept.length < config.maxPages) {
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
    if (!sitemap) {
      html.set(url, res.body);
      if (matches(url)) {
        kept.push(url);
      }
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
  return { urls: kept, html, failed };
}
