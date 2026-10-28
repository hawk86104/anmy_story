import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { MarkdownContent } from "../components/markdown-content.tsx";
import { MarkdownEditor } from "../components/markdown-editor.tsx";
import { applyMarkdown, insertMarkdownLink, normalizeMarkdownLink } from "../lib/markdown-commands.ts";
import { markdownEntryTitle, markdownExcerpt, markdownPlainText } from "../lib/markdown-text.ts";

test("格式按钮保留选区，并可撤销常用格式", () => {
  const bold = applyMarkdown("今天很好", 0, 2, "bold");
  assert.deepEqual(bold, { text: "**今天**很好", start: 2, end: 4 });
  assert.deepEqual(applyMarkdown(bold.text, bold.start, bold.end, "bold"), { text: "今天很好", start: 0, end: 2 });
  assert.equal(applyMarkdown("**今天**", 2, 4, "italic").text, "***今天***");
  const empty = applyMarkdown("", 0, 0, "bold");
  assert.equal(empty.text.slice(empty.start, empty.end), "加粗文字");
  assert.equal(applyMarkdown("第一行\n第二行", 0, 7, "list").text, "- 第一行\n- 第二行");
  assert.equal(applyMarkdown("- 第一行\n- 第二行", 0, 11, "list").text, "第一行\n第二行");
  assert.equal(applyMarkdown("一\n二", 0, 3, "numbered").text, "1. 一\n2. 二");
  assert.equal(applyMarkdown("一", 0, 0, "heading").text, "## 一");
  assert.equal(applyMarkdown("\n第二行", 0, 0, "quote").text, "> \n第二行");
});

test("插入链接只接受安全网址并保留用户文字", () => {
  assert.equal(normalizeMarkdownLink("example.com/a(b)"), "https://example.com/a%28b%29");
  assert.equal(normalizeMarkdownLink("/entries/1"), "/entries/1");
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "https://name:pass@example.com", "//evil.example", "https://example.com\\evil"]) {
    assert.equal(normalizeMarkdownLink(url), null, url);
  }
  assert.equal(insertMarkdownLink("文字\n另一行", 0, 6, "https://example.com"), null);
  const link = insertMarkdownLink("[文字]", 0, 4, "example.com");
  assert.equal(link.text, "[\\[文字\\]](https://example.com/)");
});

test("Markdown 安全渲染：保留换行、格式和表格，阻止可执行 HTML 与危险协议", () => {
  const content = "第一行\n第二行\n\n## 标题\n\n**粗体**\n\n- 项目\n\n| A | B |\n| - | - |\n| 一 | 二 |\n\n[链接](https://example.com) [危险](javascript:alert(1))\n\n<img src=x onerror=alert(1)>\n\n![图](data:text/html,evil)";
  const html = renderToStaticMarkup(React.createElement(MarkdownContent, { content }));
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector("br") !== null, true);
  assert.equal(doc.querySelector("h2")?.textContent, "标题");
  assert.equal(doc.querySelector("strong")?.textContent, "粗体");
  assert.equal(doc.querySelector("li")?.textContent, "项目");
  assert.equal(doc.querySelector("table")?.textContent.includes("二"), true);
  assert.equal(doc.querySelector('a[href="https://example.com"]')?.getAttribute("rel"), "noopener noreferrer");
  assert.equal(doc.querySelector('a[href^="javascript:"]'), null);
  assert.equal(doc.querySelector("img"), null);
  assert.equal(doc.querySelector("[onerror]"), null);
  assert.equal(doc.body.textContent.includes("<img src=x onerror=alert(1)>"), true);
});

test("时间轴和无标题记录使用可阅读的文字摘要", () => {
  const source = "# 旅行\n\n**快乐**的 [一天](https://example.com)\n\n- 出发\n- 回家";
  assert.equal(markdownPlainText(source), "旅行 快乐的 一天 出发 回家");
  assert.equal(markdownExcerpt(source, 4), "旅行 快…");
  assert.equal(markdownEntryTitle({ type: "story", content: source }), "旅行 快乐的 一天 出发 回家");
  assert.equal(markdownEntryTitle({ type: "story", title: "自己的标题", content: source }), "自己的标题");
});

test("编辑器支持按钮、快捷键、预览往返并保留正文", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost", pretendToBeVisual: true });
  const previous = {};
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Node", "Event", "KeyboardEvent", "MouseEvent"]) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  }
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  function Example() {
    const [value, setValue] = useState("今天很好");
    return React.createElement(MarkdownEditor, { value, onChange: setValue, maxLength: 50 });
  }
  const click = async (label) => {
    const button = dom.window.document.querySelector(`button[aria-label="${label}"]`);
    assert.ok(button, label);
    await act(async () => { button.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true })); button.click(); });
  };
  try {
    await act(async () => root.render(React.createElement(Example)));
    const textarea = dom.window.document.querySelector('textarea[aria-label="记录正文"]');
    textarea.focus();
    textarea.setSelectionRange(0, 2);
    await click("加粗");
    assert.equal(textarea.value, "**今天**很好");
    assert.equal(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd), "今天");
    await click("预览正文");
    assert.equal(textarea.hidden, true);
    assert.equal(dom.window.document.querySelector('[aria-label="正文预览"] strong')?.textContent, "今天");
    await click("返回编辑");
    await act(async () => new Promise((resolve) => dom.window.requestAnimationFrame(resolve)));
    assert.equal(textarea.hidden, false);
    assert.equal(textarea.value, "**今天**很好");
    assert.equal(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd), "今天");
    const shortcut = new dom.window.KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => textarea.dispatchEvent(shortcut));
    assert.equal(shortcut.defaultPrevented, true);
    assert.equal(textarea.value, "今天很好");
    const composing = new dom.window.KeyboardEvent("keydown", { key: "i", ctrlKey: true, isComposing: true, bubbles: true, cancelable: true });
    await act(async () => textarea.dispatchEvent(composing));
    assert.equal(composing.defaultPrevented, false);
    assert.equal(textarea.value, "今天很好");
    textarea.setSelectionRange(2, 4);
    await click("链接");
    const linkInput = dom.window.document.querySelector('input[autocomplete="url"]');
    assert.ok(linkInput);
    const inputSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
    await act(async () => { inputSetter.call(linkInput, "javascript:alert(1)"); linkInput.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    const insertButton = [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent === "插入");
    await act(async () => insertButton.click());
    assert.equal(textarea.value, "今天很好");
    assert.ok(dom.window.document.querySelector('[role="alert"]'));
    await act(async () => { inputSetter.call(linkInput, "example.com"); linkInput.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    await act(async () => insertButton.click());
    assert.equal(textarea.value, "今天[很好](https://example.com/)");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
