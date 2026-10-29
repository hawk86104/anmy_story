import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Next replaces this marker in server bundles; make it inert in the Node test.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "server-only"
      ? { url: "data:text/javascript,export%20%7B%7D", shortCircuit: true }
      : nextResolve(specifier, context);
  },
});

const { PublicHome, PublicCollection, PublicProjects, PublicProjectDetail, PublicMemory } =
  await import("../components/public-pages.tsx");

const profile = {
  displayName: "测试资料",
  bio: "测试简介",
  interests: [],
  theme: "usagi",
  modules: { timeline: true, works: true, honors: true, projects: true },
};
const emptyPage = { docs: [], totalDocs: 0, page: 1, totalPages: 1, hasNextPage: false };

function mockRequests() {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = (url) => new Promise((resolve) => {
    requests.push({ url: new URL(String(url)), resolve });
  });
  return {
    requests,
    respond(index, data, status = 200) {
      requests[index].resolve(new Response(JSON.stringify(data), { status }));
    },
    restore() { globalThis.fetch = previousFetch; },
  };
}

test("公开首页、栏目与项目列表不等待资料接口就开始请求列表", async () => {
  const cases = [
    [() => PublicHome(), "/api/public/entries", { limit: "3" }],
    [() => PublicCollection({ mode: "timeline", query: { page: "2", type: "story", q: "成长", year: "2024" } }), "/api/public/entries", { limit: "18", page: "2", type: "story", q: "成长", year: "2024" }],
    [() => PublicCollection({ mode: "works", query: {} }), "/api/public/entries", { type: "work" }],
    [() => PublicCollection({ mode: "honors", query: {} }), "/api/public/entries", { type: "honor" }],
    [() => PublicProjects({ query: { status: "completed", page: "3" } }), "/api/public/projects", { status: "completed", page: "3" }],
  ];
  for (const [render, listPath, params] of cases) {
    const mock = mockRequests();
    try {
      const result = render();
      assert.equal(mock.requests.length, 2);
      assert.equal(mock.requests[0].url.pathname, "/api/public/profile");
      assert.equal(mock.requests[1].url.pathname, listPath);
      for (const [key, value] of Object.entries(params)) {
        assert.equal(mock.requests[1].url.searchParams.get(key), value);
      }
      mock.respond(1, emptyPage);
      mock.respond(0, profile);
      assert.equal((await result).props.profile.displayName, "测试资料");
    } finally { mock.restore(); }
  }
});

test("关闭的栏目立即返回未找到，不必等待列表失败", async () => {
  const mock = mockRequests();
  try {
    const result = PublicCollection({ mode: "works", query: {} });
    mock.respond(0, { ...profile, modules: { ...profile.modules, works: false } });
    await assert.rejects(result, (error) => error.digest === "NEXT_HTTP_ERROR_FALLBACK;404");
    mock.respond(1, {}, 500);
  } finally { mock.restore(); }
});

test("项目详情同时请求资料、项目和相关记录，并优先处理项目未找到", async () => {
  const mock = mockRequests();
  try {
    const result = PublicProjectDetail({ id: "not-here" });
    assert.deepEqual(mock.requests.map((request) => request.url.pathname), [
      "/api/public/profile", "/api/public/projects/not-here", "/api/public/entries",
    ]);
    assert.equal(mock.requests[2].url.searchParams.get("project"), "not-here");
    mock.respond(2, {}, 500);
    mock.respond(1, {}, 404);
    mock.respond(0, profile);
    await assert.rejects(result, (error) => error.digest === "NEXT_HTTP_ERROR_FALLBACK;404");
  } finally { mock.restore(); }
});

test("项目详情保留相关记录错误及关闭模块时的处理", async () => {
  const first = mockRequests();
  try {
    const result = PublicProjectDetail({ id: "1" });
    first.respond(0, profile);
    first.respond(1, { id: 1, title: "测试项目", status: "exploring", visibility: "public" });
    first.respond(2, {}, 500);
    await assert.rejects(result, /成长空间暂时无法连接/);
  } finally { first.restore(); }

  const second = mockRequests();
  try {
    const result = PublicProjectDetail({ id: "1" });
    second.respond(0, { ...profile, modules: { ...profile.modules, projects: false } });
    await assert.rejects(result, (error) => error.digest === "NEXT_HTTP_ERROR_FALLBACK;404");
    second.respond(1, {}, 404);
    second.respond(2, {}, 500);
  } finally { second.restore(); }
});

test("未公开的记录详情继续返回未找到", async () => {
  const mock = mockRequests();
  try {
    const result = PublicMemory({ id: "private" });
    mock.respond(0, profile);
    mock.respond(1, {}, 404);
    await assert.rejects(result, (error) => error.digest === "NEXT_HTTP_ERROR_FALLBACK;404");
  } finally { mock.restore(); }
});
