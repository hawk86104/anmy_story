import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { readOfflineDraft, removeOfflineDraft } from "../lib/offline-draft.ts";

const workerSource = await readFile(
  new URL("../lib/service-worker.js", import.meta.url),
  "utf8",
);
const draftSource = await readFile(
  new URL("../../public/offline-draft.js", import.meta.url),
  "utf8",
);
const origin = "https://anmy.icegl.cn";
function worker() {
  const handlers = {},
    stores = new Map(),
    state = { skipped: 0, claimed: 0 };
  let network = async () =>
    new Response("private HTML", {
      headers: { "Cache-Control": "private, no-store" },
    });
  const cache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const files = stores.get(name);
    return {
      addAll: async (paths) => {
        for (const path of paths)
          files.set(
            path,
            path === "/offline.html" ? "offline shell" : "public asset",
          );
      },
      match: async (path) =>
        files.has(path) ? new Response(files.get(path)) : undefined,
    };
  };
  const self = {
    location: { origin },
    addEventListener: (name, handler) => {
      handlers[name] = handler;
    },
    skipWaiting: () => state.skipped++,
    clients: {
      claim: async () => {
        state.claimed++;
      },
    },
  };
  vm.runInNewContext(workerSource.replaceAll("__SHELL_VERSION__", "test-v2"), {
    self,
    URL,
    Response,
    caches: {
      open: async (name) => cache(name),
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
    },
    fetch: (request) => network(request),
  });
  const event = (name) => {
    let done;
    handlers[name]({
      waitUntil: (promise) => {
        done = promise;
      },
    });
    return done;
  };
  const request = (url, options = {}) => {
    let response;
    handlers.fetch({
      request: {
        url: new URL(url, origin).href,
        method: "GET",
        mode: "cors",
        ...options,
      },
      respondWith: (promise) => {
        response = promise;
      },
    });
    return response;
  };
  return {
    handlers,
    stores,
    state,
    event,
    request,
    disconnect: () => {
      network = async () => {
        throw new TypeError("offline");
      };
    },
  };
}

test("离线缓存只包含公共外壳，API、媒体、登录和页面正文不写入缓存", async () => {
  const app = worker();
  await app.event("install");
  const cached = [...app.stores.values()][0];
  assert.deepEqual(
    [...cached.keys()].sort(),
    [
      "/app-icon.svg",
      "/offline-draft.js",
      "/offline.css",
      "/offline.html",
    ].sort(),
  );
  for (const path of [
    "/api/users/me",
    "/api/entries/42",
    "/api/media/file/private.jpg",
    "/admin",
    "https://story.icegl.cn/api/entries",
  ])
    assert.equal(app.request(path), undefined);
  assert.equal(app.request("/app", { method: "POST" }), undefined);
  assert.equal(
    await (await app.request("/app/entries/42", { mode: "navigate" })).text(),
    "private HTML",
  );
  assert.equal(cached.size, 4);
  app.disconnect();
  assert.equal(
    await (await app.request("/app/entries/42", { mode: "navigate" })).text(),
    "offline shell",
  );
  assert.equal(
    await (await app.request("/offline-draft.js")).text(),
    "public asset",
  );
  assert.equal(app.request("/app/entries/42?_rsc=secret"), undefined);
});

test("更新等待用户操作，激活时只移除本应用的旧外壳缓存", async () => {
  const app = worker();
  app.stores.set("mylife-shell-old", new Map());
  app.stores.set("another-app-cache", new Map());
  await app.event("install");
  assert.equal(app.state.skipped, 0);
  app.handlers.message({ data: { type: "ACTIVATE_UPDATE" } });
  assert.equal(app.state.skipped, 1);
  await app.event("activate");
  assert.equal(app.stores.has("mylife-shell-old"), false);
  assert.equal(app.stores.has("another-app-cache"), true);
  assert.equal(app.state.claimed, 1);
});

async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("等待离线草稿状态超时");
}
function page(indexedDB) {
  const fields = Object.fromEntries(
    ["title", "content", "occurredAt"].map((name) => [
      name,
      { value: "", disabled: false },
    ]),
  );
  const form = new EventTarget(),
    clear = new EventTarget(),
    link = new EventTarget(),
    status = { textContent: "" };
  const document = new EventTarget(),
    window = new EventTarget(),
    location = { href: "/offline.html" };
  document.visibilityState = "visible";
  document.getElementById = (id) => fields[id];
  document.querySelector = (selector) =>
    ({
      "#offline-form": form,
      "#status": status,
      "#clear": clear,
      'a[href="/app/new"]': link,
    })[selector];
  document.querySelectorAll = () => [...Object.values(fields), clear];
  vm.runInNewContext(draftSource, {
    document,
    window,
    location,
    indexedDB,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
  });
  return { fields, form, clear, link, status, location };
}

test("IndexedDB 事务保留离线文字；另一个页面的旧草稿不能覆盖或删除新版本", async () => {
  globalThis.indexedDB = new IDBFactory();
  const first = page(indexedDB);
  await until(() => first.status.textContent.includes("可以开始"));
  first.fields.title.value = "断网时的小发现";
  first.fields.content.value = "第一段文字";
  first.fields.occurredAt.value = "2020-05-01";
  first.form.dispatchEvent(new Event("submit", { cancelable: true }));
  await until(() => first.status.textContent.includes("文字已存"));
  const draft = await readOfflineDraft();
  assert.equal(draft.content, "第一段文字");
  assert.equal(draft.occurredAt, "2020-05-01");
  const second = page(indexedDB);
  await until(() => second.status.textContent.includes("已经接上"));
  assert.equal(second.fields.content.value, "第一段文字");
  first.fields.content.value = "第一个页面的新版本";
  first.form.dispatchEvent(new Event("submit", { cancelable: true }));
  await until(
    async () => (await readOfflineDraft()).content === "第一个页面的新版本",
  );
  second.fields.content.value = "另一个页面的旧编辑";
  second.link.dispatchEvent(new Event("click", { cancelable: true }));
  await until(() => second.status.textContent.includes("另一个页面更新"));
  assert.equal(second.location.href, "/offline.html");
  assert.equal(second.fields.content.value, "另一个页面的旧编辑");
  await removeOfflineDraft(draft.version);
  const current = await readOfflineDraft();
  assert.equal(current.content, "第一个页面的新版本");
  await removeOfflineDraft(current.version);
  assert.equal(await readOfflineDraft(), undefined);
});
