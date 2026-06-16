/**
 * HTML page -> markdown file: pull out the main content and title, convert to
 * markdown, and read/write the YAML frontmatter that records each page's source
 * URL (used to map a file back to its page for deletion tracking). Nothing
 * volatile is stored, so an unchanged page produces a byte-identical file.
 */

import matter from "gray-matter";
import { htmlToMarkdown as toMarkdown } from "../../lib/html-to-markdown.js";

/** Tags that never carry page content; dropped before conversion. */
const CHROME =
  /<(script|style|noscript|svg|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** First <main> or <article> region, falling back to <body>, else the whole input. */
function contentRegion(html: string): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main) {
    return main[1];
  }
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article) {
    return article[1];
  }
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return body ? body[1] : html;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function pageTitle(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1]).trim() : "";
}

/** Rewrite each <a href> a resolver maps to a local file, leaving the rest as-is. */
function rewriteLinks(html: string, resolve: LinkResolver): string {
  return html.replace(
    /(<a\b[^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gi,
    (full, prefix, quote, href) => {
      const local = resolve(href);
      return local ? `${prefix}${quote}${local}${quote}` : full;
    },
  );
}

/** Maps a raw href to a relative path to its local .md file, or null to keep it. */
export type LinkResolver = (href: string) => string | null;

export function htmlToMarkdown(
  html: string,
  resolveLink?: LinkResolver,
): string {
  let region = contentRegion(html).replace(CHROME, "");
  if (resolveLink) {
    region = rewriteLinks(region, resolveLink);
  }
  return toMarkdown(region)
    .replace(/\[[\s\u200b]*\]\([^)]*\)/g, "")
    .replace(/^#{1,6}[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function serializePage(
  url: string,
  title: string,
  body: string,
): string {
  return matter.stringify(`\n${body}\n`, { url, title });
}

/** Source URL stored in a file's frontmatter, or null if it isn't a synced page. */
export function urlOf(content: string): string | null {
  const { data } = matter(content);
  return typeof data.url === "string" ? data.url : null;
}
