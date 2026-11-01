import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import { SessionProvider } from "../components/session.tsx";
import { EntryEditor } from "../components/entry-editor.tsx";

test("编辑器默认公开新记录，保留已有私密选择与草稿的发表选择", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", {
    url: "http://localhost/app/new",
    pretendToBeVisual: true,
  });
  const previous = {};
  for (const key of [
    "window",
    "self",
    "document",
    "location",
    "navigator",
    "HTMLElement",
    "HTMLAnchorElement",
    "Node",
    "Event",
    "MouseEvent",
  ]) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      value: dom.window[key],
      configurable: true,
      writable: true,
    });
  }
  const previousIndex = globalThis.indexedDB,
    previousRange = globalThis.IDBKeyRange;
  const previousFetch = globalThis.fetch,
    previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const user = { id: 1, name: "测试", role: "child", familyId: "test-family" };
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url), "http://localhost").pathname;
    const data =
      pathname === "/api/users/me"
        ? { user }
        : pathname === "/api/family/space"
          ? { displayName: "测试", theme: "usagi", modules: {}, canEdit: true }
          : pathname === "/api/capabilities"
            ? { maxUploadMB: 100, preserveOriginals: false }
            : pathname === "/api/projects"
              ? { docs: [] }
              : pathname === "/api/family/entry-tags"
                ? { tags: [] }
                : null;
    if (!data) throw new Error(`unexpected request: ${pathname}`);
    return new Response(JSON.stringify(data));
  };
  const router = { replace() {}, refresh() {}, prefetch() {} };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  const base = {
    type: "quick",
    content: "已有记录",
    title: "",
    reflection: "",
    learning: "",
    datePrecision: "unknown",
    dateNote: "",
    retrospective: false,
    tags: [],
    media: [],
    projects: [],
    author: 1,
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  async function show(entry, key) {
    await act(async () => {
      root.render(
        React.createElement(
          AppRouterContext.Provider,
          { value: router },
          React.createElement(
            PathnameContext.Provider,
            { value: "/app/new" },
            React.createElement(
              SessionProvider,
              null,
              React.createElement(EntryEditor, { entry, key }),
            ),
          ),
        ),
      );
    });
    for (
      let i = 0;
      i < 20 &&
      !dom.window.document.querySelector(".visibility-control > button");
      i++
    )
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    return dom.window.document.querySelector(".visibility-control > button")
      ?.textContent;
  }
  try {
    assert.match(await show(undefined, "new"), /所有人可见/);
    assert.match(
      dom.window.document.querySelector(".visibility-control")?.textContent,
      /草稿仅自己和家长可见/,
    );
    assert.match(
      await show(
        {
          ...base,
          id: 2,
          status: "saved",
          visibility: "family",
          publicRequested: false,
        },
        "private",
      ),
      /仅自己和家长可见/,
    );
    assert.match(
      await show(
        {
          ...base,
          id: 5,
          status: "draft",
          visibility: "family",
          publicRequested: true,
          reviewStatus: "pending",
        },
        "legacy-pending-draft",
      ),
      /仅自己和家长可见/,
    );
    assert.match(
      await show(
        {
          ...base,
          id: 3,
          status: "draft",
          visibility: "family",
        publicRequested: true,
        reviewStatus: "none",
        },
        "public-draft",
      ),
      /所有人可见/,
    );
    assert.match(
      await show(
        {
          ...base,
          id: 4,
          status: "draft",
          visibility: "family",
        publicRequested: false,
        reviewStatus: "none",
        },
        "private-draft",
      ),
      /仅自己和家长可见/,
    );
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    globalThis.indexedDB = previousIndex;
    globalThis.IDBKeyRange = previousRange;
    globalThis.fetch = previousFetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
