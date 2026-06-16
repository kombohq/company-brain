/**
 * Shared HTML -> Markdown conversion. Owns the single Turndown instance and its
 * configuration (ATX headings, fenced code blocks, kept <pre>/<code>, GFM tables)
 * so connectors don't each re-create and re-tune Turndown. Callers do their own
 * source-specific pre/post processing (content extraction, link rewriting, ...).
 */

import TurndownService from "turndown";
import { addTableRules } from "./turndown-tables.js";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});
turndown.keep(["pre", "code"]);
addTableRules(turndown);

export function htmlToMarkdown(html: string): string {
  return turndown
    .turndown(html || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
