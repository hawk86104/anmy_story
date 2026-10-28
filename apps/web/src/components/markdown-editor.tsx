"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Bold, Italic, Heading2, List, ListOrdered, Quote, Link2, Eye, Pencil } from "lucide-react";
import { applyMarkdown, insertMarkdownLink, type MarkdownCommand, type MarkdownEdit } from "@/lib/markdown-commands";
import { MarkdownContent } from "./markdown-content";

const tools: { command: MarkdownCommand; label: string; icon: typeof Bold; title: string }[] = [
  { command: "bold", label: "加粗", icon: Bold, title: "加粗（Ctrl / ⌘ + B）" },
  { command: "italic", label: "斜体", icon: Italic, title: "斜体（Ctrl / ⌘ + I）" },
  { command: "heading", label: "小标题", icon: Heading2, title: "小标题" },
  { command: "list", label: "列表", icon: List, title: "项目列表" },
  { command: "numbered", label: "编号", icon: ListOrdered, title: "编号列表" },
  { command: "quote", label: "引用", icon: Quote, title: "引用" },
];

export function MarkdownEditor({ value, onChange, placeholder, maxLength = 50000, disabled = false }: {
  value: string; onChange: (text: string) => void; placeholder?: string; maxLength?: number; disabled?: boolean;
}) {
  const id = useId(), textarea = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<MarkdownEdit | null>(null), composing = useRef(false);
  const selection = useRef({ start: 0, end: 0 });
  const [preview, setPreview] = useState(false), [message, setMessage] = useState("");
  const [link, setLink] = useState<{ start: number; end: number; text: string } | null>(null);
  const [address, setAddress] = useState("");

  useLayoutEffect(() => {
    const change = pending.current;
    if (!change || change.text !== value || !textarea.current) return;
    textarea.current.focus({ preventScroll: true });
    textarea.current.setSelectionRange(change.start, change.end);
    pending.current = null;
  }, [value]);

  function apply(change: MarkdownEdit) {
    if (change.text.length > maxLength) {
      setMessage(`正文最多 ${maxLength} 字，请先精简内容再添加格式。`);
      textarea.current?.focus({ preventScroll: true });
      return;
    }
    setMessage("");
    if (change.text === value) {
      textarea.current?.focus({ preventScroll: true });
      textarea.current?.setSelectionRange(change.start, change.end);
      return;
    }
    pending.current = change;
    onChange(change.text);
    // Keep the mobile keyboard open while React commits the updated value.
    textarea.current?.focus({ preventScroll: true });
  }
  function format(command: MarkdownCommand) {
    if (preview || disabled || !textarea.current) return;
    if (composing.current) { setMessage("请先完成输入法选字，再添加格式。"); return; }
    apply(applyMarkdown(value, textarea.current.selectionStart, textarea.current.selectionEnd, command));
  }
  function changePreview() {
    if (!preview && textarea.current) selection.current = { start: textarea.current.selectionStart, end: textarea.current.selectionEnd };
    setLink(null); setMessage(""); setPreview((current) => !current);
    if (preview) window.requestAnimationFrame(() => {
      textarea.current?.focus({ preventScroll: true });
      textarea.current?.setSelectionRange(selection.current.start, selection.current.end);
    });
  }
  function startLink() {
    if (preview || disabled || !textarea.current) return;
    if (composing.current) { setMessage("请先完成输入法选字，再添加链接。"); return; }
    setLink({ start: textarea.current.selectionStart, end: textarea.current.selectionEnd, text: value });
    setAddress(""); setMessage("");
  }
  function addLink() {
    if (!link) return;
    if (link.text !== value) { setMessage("正文已更新，请重新选择文字后添加链接。"); setLink(null); return; }
    const result = insertMarkdownLink(value, link.start, link.end, address);
    if (!result) { setMessage("请输入有效的网址，并选择同一行内的链接文字。"); return; }
    if (result.text.length > maxLength) { setMessage(`正文最多 ${maxLength} 字，请先精简内容再添加链接。`); return; }
    setLink(null); apply(result);
  }
  function cancelLink() {
    const current = link;
    setLink(null); setMessage("");
    window.requestAnimationFrame(() => {
      textarea.current?.focus({ preventScroll: true });
      if (current) textarea.current?.setSelectionRange(current.start, current.end);
    });
  }
  return (
    <div className="markdown-editor">
      <div className="markdown-toolbar" role="toolbar" aria-label="正文格式工具">
        {tools.map(({ command, label, icon: Icon, title }) => (
          <button type="button" key={command} title={title} aria-label={label} disabled={disabled || preview} onMouseDown={(event) => event.preventDefault()} onClick={() => format(command)}><Icon size={16} aria-hidden="true" /><span>{label}</span></button>
        ))}
        <button type="button" title="添加链接" aria-label="链接" disabled={disabled || preview} onMouseDown={(event) => event.preventDefault()} onClick={startLink}><Link2 size={16} aria-hidden="true" /><span>链接</span></button>
        <button type="button" className="markdown-preview-toggle" aria-label={preview ? "返回编辑" : "预览正文"} aria-pressed={preview} aria-controls={`${id}-preview`} disabled={disabled} onClick={changePreview}>{preview ? <Pencil size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}<span>{preview ? "编辑" : "预览"}</span></button>
      </div>
      {link && <div className="markdown-link-panel" role="group" aria-label="插入链接">
        <label htmlFor={`${id}-url`}>链接网址</label>
        <input id={`${id}-url`} type="text" inputMode="url" autoComplete="url" placeholder="https://example.com" maxLength={2048} value={address} autoFocus onChange={(event) => { setAddress(event.target.value); setMessage(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } else if (event.key === "Escape") { event.preventDefault(); cancelLink(); } }} />
        <button type="button" className="secondary-button" onClick={addLink}>插入</button><button type="button" className="text-button" onClick={cancelLink}>取消</button>
      </div>}
      {message && <p className="markdown-message" role="alert">{message}</p>}
      <textarea ref={textarea} id={`${id}-source`} className="entry-body-input" aria-label="记录正文" aria-describedby={`${id}-help`} hidden={preview} disabled={disabled} value={value} maxLength={maxLength} onChange={(event) => { setMessage(""); onChange(event.target.value); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || composing.current || event.altKey || !(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        if (key === "b" || key === "i") { event.preventDefault(); format(key === "b" ? "bold" : "italic"); }
      }} placeholder={placeholder} />
      <div id={`${id}-preview`} className="markdown-preview" role="region" aria-label="正文预览" hidden={!preview}>{value.trim() ? <MarkdownContent content={value} /> : <p className="muted">写一点文字，就可以在这里预览。</p>}</div>
      <p id={`${id}-help`} className="markdown-help">选中文字后点按钮添加格式；照片、视频和录音可以在下方添加。</p>
    </div>
  );
}
