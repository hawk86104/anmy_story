import { entryTitle, type EntryType } from "@mylife/shared";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

const processor = unified().use(remarkParse).use(remarkGfm);
type Node = { type: string; value?: string; alt?: string | null; children?: Node[] };
const separateChildren = new Set(["root", "list", "listItem", "blockquote", "table", "tableRow"]);
function visibleText(node: Node): string {
  if (node.type === "image" || node.type === "imageReference") return node.alt || "";
  if (node.type === "break") return " ";
  if (typeof node.value === "string") return node.value;
  return (node.children || []).map(visibleText).join(separateChildren.has(node.type) ? " " : "");
}

/** Card summaries remain readable without rendering links, images or Markdown punctuation. */
export function markdownPlainText(content: string | null | undefined) {
  if (!content) return "";
  // Summaries only need the beginning; avoid parsing an entire 50k-character
  // record for each card on a phone.
  const tree = processor.parse(content.trimStart().slice(0, 4096)) as Node;
  return visibleText(tree).replace(/\s+/g, " ").trim();
}
export function markdownExcerpt(content: string | null | undefined, length: number) {
  const text = markdownPlainText(content);
  return text.length > length ? `${text.slice(0, length)}…` : text;
}
export function markdownEntryTitle(entry: { title?: string | null; content?: string | null; type: EntryType }) {
  return entry.title || markdownPlainText(entry.content).slice(0, 32) || entryTitle({ type: entry.type });
}
