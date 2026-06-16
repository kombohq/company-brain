/**
 * Teach Turndown to emit GFM pipe tables. The built-in handling drops <table>
 * markup and dumps the cells as a flat list, which is unreadable for the dense
 * reference tables on docs pages. A table only maps cleanly when its first row
 * is a header (pipe tables require one), so headerless tables are kept as HTML.
 */
import type TurndownService from "turndown";

export function addTableRules(service: TurndownService): void {
  const hasHeader = (table: HTMLTableElement) =>
    table.rows.length > 0 && isHeadingRow(table.rows[0]);

  service.addRule("tableCell", {
    filter: ["th", "td"],
    replacement: (content, node) => cell(content, node),
  });
  service.addRule("tableRow", {
    filter: "tr",
    replacement: (content, node) => {
      let separator = "";
      if (isHeadingRow(node as HTMLTableRowElement)) {
        for (const child of Array.from(node.childNodes)) {
          separator += cell("---", child);
        }
      }
      return `\n${content}${separator ? `\n${separator}` : ""}`;
    },
  });
  service.addRule("table", {
    filter: (node) =>
      node.nodeName === "TABLE" && hasHeader(node as HTMLTableElement),
    replacement: (content) => `\n\n${content.replace("\n\n", "\n")}\n\n`,
  });
  service.addRule("tableSection", {
    filter: ["thead", "tbody", "tfoot"],
    replacement: (content) => content,
  });
  service.keep(
    (node) => node.nodeName === "TABLE" && !hasHeader(node as HTMLTableElement),
  );
}

/** First row is a header when it lives in <thead> or is an all-<th> first row. */
function isHeadingRow(tr: HTMLTableRowElement): boolean {
  const parent = tr.parentNode as Element;
  return (
    parent.nodeName === "THEAD" ||
    (parent.firstChild === tr &&
      (parent.nodeName === "TABLE" || isFirstTbody(parent)) &&
      Array.from(tr.childNodes).every((n) => n.nodeName === "TH"))
  );
}

function isFirstTbody(element: Element): boolean {
  const previous = element.previousSibling;
  return (
    element.nodeName === "TBODY" &&
    (!previous ||
      (previous.nodeName === "THEAD" &&
        /^\s*$/i.test(previous.textContent ?? "")))
  );
}

function cell(content: string, node: Node): string {
  const prefix = (node as Element).previousElementSibling ? " " : "| ";
  return `${prefix}${content.replace(/\n/g, " ")} |`;
}
