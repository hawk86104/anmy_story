import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act, useEffect } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import { SessionProvider, useSession } from "../components/session.tsx";
import { PublicNavigationProvider, usePublicNavigation } from "../components/public-navigation.tsx";
import PublicLoading from "../components/public-loading.tsx";

const profile = {
  displayName: "测试资料", bio: "测试简介", interests: [], theme: "hachiware",
  modules: { timeline: true, works: false, honors: true, projects: true },
};

async function withDom(run) {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost", pretendToBeVisual: true });
  const previous = {};
  for (const key of ["window", "self", "document", "navigator", "HTMLElement", "HTMLAnchorElement", "Node", "Event", "MouseEvent"]) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  }
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  try { await run({ root, document: dom.window.document }); }
  finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
}

test("快速切换路径复用未完成的登录检查，并防止退出后的旧响应恢复会话", async () => {
  const previousFetch = globalThis.fetch;
  const checks = [];
  const redirects = [];
  const router = { replace: (path) => redirects.push(path), refresh() {}, prefetch() {} };
  globalThis.fetch = (url) => {
    const path = new URL(String(url), "http://localhost").pathname;
    if (path === "/api/users/me") return new Promise((resolve) => checks.push(resolve));
    if (path === "/api/family/space") return Promise.resolve(new Response(JSON.stringify({ ...profile, canEdit: true })));
    if (path === "/api/users/logout") return Promise.resolve(new Response("{}"));
    throw new Error(`意外请求 ${path}`);
  };
  try {
    await withDom(async ({ root, document }) => {
      let session;
      function Probe() { session = useSession(); return React.createElement("p", null, session.user.name); }
      const render = (path) => root.render(
        React.createElement(AppRouterContext.Provider, { value: router },
          React.createElement(PathnameContext.Provider, { value: path },
            React.createElement(SessionProvider, null, React.createElement(Probe)))),
      );
      await act(async () => render("/app"));
      await act(async () => render("/app/entries/7"));
      await act(async () => render("/app/projects"));
      assert.equal(checks.length, 1);
      await act(async () => checks[0](new Response(JSON.stringify({ user: null }))));
      assert.equal(redirects.at(-1), "/login?next=%2Fapp%2Fprojects");

      await act(async () => render("/app/drafts"));
      assert.equal(checks.length, 2);
      const user = { id: 1, name: "测试用户", role: "parent", familyId: 1 };
      await act(async () => checks[1](new Response(JSON.stringify({ user }))));
      assert.equal(document.body.textContent.includes("测试用户"), true);

      await act(async () => render("/app/projects"));
      assert.equal(checks.length, 3);
      await act(async () => session.logout());
      assert.equal(redirects.at(-1), "/login");
      await act(async () => checks[2](new Response(JSON.stringify({ user }))));
      assert.equal(document.body.textContent.includes("正在打开你的成长空间"), true);
      assert.equal(document.body.textContent.includes("测试用户"), false);
    });
  } finally { globalThis.fetch = previousFetch; }
});

test("公开加载状态保留上一次的主题和可用导航", async () => {
  await withDom(async ({ root, document }) => {
    function RememberProfile() {
      const { rememberProfile } = usePublicNavigation();
      useEffect(() => rememberProfile(profile), [rememberProfile]);
      return React.createElement(PublicLoading);
    }
    const router = { prefetch() {}, replace() {}, refresh() {} };
    await act(async () => root.render(
      React.createElement(AppRouterContext.Provider, { value: router },
        React.createElement(PathnameContext.Provider, { value: "/projects" },
          React.createElement(PublicNavigationProvider, null, React.createElement(RememberProfile)))),
    ));
    assert.equal(document.querySelector(".site")?.getAttribute("data-theme"), "hachiware");
    assert.equal(document.querySelector('[role="status"]')?.textContent.includes("正在翻开这一页"), true);
    assert.ok(document.querySelector('.site-desktop-nav a[href="/projects"][aria-current="page"]'));
    assert.equal(document.querySelector('.site-desktop-nav a[href="/works"]'), null);
  });
});
