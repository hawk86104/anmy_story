export type MarkdownCommand = "bold" | "italic" | "heading" | "list" | "numbered" | "quote";
export type MarkdownEdit = { text: string; start: number; end: number };

function isWrapped(value: string, marker: string) {
  if (value.length <= marker.length * 2 || !value.startsWith(marker) || !value.endsWith(marker)) return false;
  // Selecting the inside of bold text and pressing italic should add italic,
  // rather than accidentally removing one half of the bold markers.
  return marker !== "*" || !(value.startsWith("**") && value.endsWith("**"));
}

function inline(text: string, start: number, end: number, marker: string, placeholder: string): MarkdownEdit {
  const selected = text.slice(start, end);
  if (!selected) {
    const insertion = `${marker}${placeholder}${marker}`;
    return { text: text.slice(0, start) + insertion + text.slice(end), start: start + marker.length, end: start + marker.length + placeholder.length };
  }
  const before = text.slice(0, start), after = text.slice(end);
  const enclosed = before.endsWith(marker) && after.startsWith(marker) &&
    !(marker === "*" && before.endsWith("**") && after.startsWith("**"));
  if (enclosed && !selected.includes("\n")) {
    return { text: before.slice(0, -marker.length) + selected + after.slice(marker.length), start: start - marker.length, end: end - marker.length };
  }
  const lines = selected.split("\n");
  const pieces = lines.map((line) => {
    const leading = line.match(/^[ \t]*/)?.[0] || "";
    const trailing = line.match(/[ \t]*$/)?.[0] || "";
    const core = line.slice(leading.length, line.length - trailing.length || undefined);
    return { leading, core, trailing };
  });
  const useful = pieces.filter((piece) => piece.core);
  if (!useful.length) {
    const insertion = `${selected}${marker}${placeholder}${marker}`;
    return { text: before + insertion + after, start: start + selected.length + marker.length, end: start + selected.length + marker.length + placeholder.length };
  }
  const remove = useful.every((piece) => isWrapped(piece.core, marker));
  const result = pieces.map(({ leading, core, trailing }) => {
    if (!core) return leading;
    const body = remove ? core.slice(marker.length, -marker.length) : isWrapped(core, marker) ? core : `${marker}${core}${marker}`;
    return leading + body + trailing;
  }).join("\n");
  if (lines.length > 1) return { text: before + result + after, start, end: start + result.length };
  const leading = pieces[0].leading.length;
  const inner = remove ? pieces[0].core.slice(marker.length, -marker.length) : pieces[0].core;
  return { text: before + result + after, start: start + leading + (remove ? 0 : marker.length), end: start + leading + (remove ? 0 : marker.length) + inner.length };
}

const patterns = {
  heading: /^#{1,6}[ \t]+/,
  list: /^[-+*][ \t]+/,
  numbered: /^\d+[.)][ \t]+/,
  quote: /^>[ \t]?/,
};
function lines(text: string, start: number, end: number, command: keyof typeof patterns): MarkdownEdit {
  const first = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  const endPosition = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = text.indexOf("\n", endPosition);
  const last = nextBreak === -1 ? text.length : nextBreak;
  const source = text.slice(first, last).split("\n");
  const parts = source.map((line) => {
    const indent = line.match(/^[ \t]*/)?.[0] || "";
    const content = line.slice(indent.length);
    return { indent, content, prefix: content.match(patterns[command])?.[0] || "" };
  });
  const useful = parts.filter(({ content }) => content.trim());
  const remove = useful.length > 0 && useful.every(({ prefix }) => prefix);
  let number = 0;
  const changed = parts.map(({ indent, content, prefix }) => {
    if (!content.trim() && parts.length > 1) return indent;
    number++;
    if (remove) return indent + content.slice(prefix.length);
    if (prefix) return indent + content;
    const prefixToAdd = command === "heading" ? "## " : command === "list" ? "- " : command === "numbered" ? `${number}. ` : "> ";
    return indent + prefixToAdd + content;
  }).join("\n");
  const result = text.slice(0, first) + changed + text.slice(last);
  if (start !== end) return { text: result, start: first, end: first + changed.length };
  const delta = changed.length - (last - first);
  const cursor = Math.max(first, Math.min(first + changed.length, start + delta));
  return { text: result, start: cursor, end: cursor };
}

export function applyMarkdown(text: string, start: number, end: number, command: MarkdownCommand): MarkdownEdit {
  start = Math.max(0, Math.min(text.length, Number.isFinite(start) ? Math.floor(start) : 0));
  end = Math.max(start, Math.min(text.length, Number.isFinite(end) ? Math.floor(end) : start));
  if (command === "bold") return inline(text, start, end, "**", "加粗文字");
  if (command === "italic") return inline(text, start, end, "*", "斜体文字");
  return lines(text, start, end, command);
}

export function normalizeMarkdownLink(value: string): string | null {
  const raw = value.trim();
  if (!raw || /[\x00-\x1f\x7f\\]/.test(raw)) return null;
  if (raw.startsWith("//")) return null;
  if (raw.startsWith("#")) return raw.replace(/[()\s]/g, (c) => encodeURIComponent(c));
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw.replace(/[()\s]/g, (c) => encodeURIComponent(c));
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href.replace(/[()]/g, (c) => c === "(" ? "%28" : "%29");
  } catch { return null; }
}

export function insertMarkdownLink(text: string, start: number, end: number, url: string): MarkdownEdit | null {
  const address = normalizeMarkdownLink(url);
  if (!address || start < 0 || end < start || end > text.length || text.slice(start, end).includes("\n")) return null;
  const label = text.slice(start, end) || "链接文字";
  const escaped = label.replace(/\\/g, "\\\\").replace(/[\[\]]/g, "\\$&");
  const insertion = `[${escaped}](${address})`;
  return { text: text.slice(0, start) + insertion + text.slice(end), start: start + 1, end: start + 1 + escaped.length };
}
