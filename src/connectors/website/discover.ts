/**
 * Collect the set of page URLs to sync, either from a sitemap (when the start
 * URL points at an .xml) or by crawling links within the start URL's host.
 * An optional include regex (tested against the path) narrows both what is
 * crawled and what is kept.
 */

export const USER_AGENT = "company-brain-website-sync";

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

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.text();
}

function locsFrom(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((m) =>
    m[1].trim(),
  );
}

/** Read a sitemap (recursing into sitemap-index entries) into a flat URL list. */
async function fromSitemap(startUrl: string): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const queue = [startUrl];
  while (queue.length) {
    const sitemap = queue.shift()!;
    if (seen.has(sitemap)) {
      continue;
    }
    seen.add(sitemap);
    for (const loc of locsFrom(await fetchText(sitemap))) {
      if (loc.endsWith(".xml")) {
        queue.push(loc);
      } else {
        out.push(loc);
      }
    }
  }
  return out;
}

function linksFrom(html: string, base: string, host: string): string[] {
  const hrefs = [...html.matchAll(/<a\b[^>]*\shref=["']([^"']+)["']/gi)].map(
    (m) => m[1],
  );
  const out: string[] = [];
  for (const href of hrefs) {
    const normalized = normalizeUrl(href, base);
    if (normalized && new URL(normalized).host === host) {
      out.push(normalized);
    }
  }
  return out;
}

/** Breadth-first crawl within the start URL's host, caching fetched HTML. */
async function crawl(
  config: DiscoverConfig,
  html: Map<string, string>,
): Promise<string[]> {
  const start = normalizeUrl(config.startUrl);
  if (!start) {
    throw new Error(`Invalid start URL: ${config.startUrl}`);
  }
  const host = new URL(start).host;
  const matches = (url: string) =>
    !config.include || config.include.test(new URL(url).pathname);

  const queued = new Set([start]);
  const queue = [start];
  const kept: string[] = [];
  while (queue.length && kept.length < config.maxPages) {
    const url = queue.shift()!;
    let body: string;
    try {
      body = await fetchText(url);
    } catch (err) {
      console.warn(`  skip ${url}: ${(err as Error).message}`);
      continue;
    }
    html.set(url, body);
    if (matches(url)) {
      kept.push(url);
    }
    for (const link of linksFrom(body, url, host)) {
      if (!queued.has(link) && matches(link)) {
        queued.add(link);
        queue.push(link);
      }
    }
  }
  return kept;
}

/**
 * Returns the page URLs to sync plus any HTML already fetched during discovery
 * (populated by crawling, empty for sitemaps) so callers can avoid refetching.
 */
export async function discover(
  config: DiscoverConfig,
): Promise<{ urls: string[]; html: Map<string, string> }> {
  const html = new Map<string, string>();
  const isSitemap = new URL(config.startUrl).pathname.endsWith(".xml");
  if (!isSitemap) {
    return { urls: await crawl(config, html), html };
  }

  const matches = (url: string) =>
    !config.include || config.include.test(new URL(url).pathname);
  const urls = (await fromSitemap(config.startUrl))
    .map((loc) => normalizeUrl(loc))
    .filter((url): url is string => url !== null && matches(url))
    .slice(0, config.maxPages);
  return { urls: [...new Set(urls)], html };
}
