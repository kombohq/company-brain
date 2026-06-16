/**
 * Help Center article -> markdown file: convert the HTML body to markdown and
 * record the article's metadata in YAML frontmatter. The `zendesk_id` in the
 * frontmatter maps a file back to its article (used to prune deleted ones).
 * Nothing volatile is stored, so an unchanged article produces an identical file.
 */

import matter from "gray-matter";
import { htmlToMarkdown } from "../../lib/html-to-markdown.js";
import type { HelpCenterArticle } from "./client.js";

export function serializeArticle(article: HelpCenterArticle): string {
  const frontmatter: Record<string, unknown> = {
    zendesk_id: article.id,
    title: article.title ?? `Article ${article.id}`,
    url: article.html_url ?? null,
    locale: article.locale ?? null,
    section_id: article.section_id ?? null,
    labels: article.label_names ?? [],
    created_at: article.created_at ?? null,
    updated_at: article.edited_at ?? article.updated_at ?? null,
  };
  const body = htmlToMarkdown(article.body ?? "");
  return matter.stringify(`\n${body}\n`, frontmatter);
}

/** The article id stored in a file's frontmatter, or null if it isn't one. */
export function idOf(content: string): number | null {
  const { data } = matter(content);
  return typeof data.zendesk_id === "number" ? data.zendesk_id : null;
}
