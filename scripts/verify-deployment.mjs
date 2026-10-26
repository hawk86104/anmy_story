import assert from "node:assert/strict";
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: {
    "api-origin": { type: "string" },
    "web-origin": { type: "string" },
  },
});
if (!values["api-origin"] || !values["web-origin"]) {
  throw new Error(
    "用法：node scripts/verify-deployment.mjs --api-origin https://story.icegl.cn --web-origin https://anmy.icegl.cn",
  );
}
const api = new URL(values["api-origin"]).origin;
const web = new URL(values["web-origin"]).origin;
async function request(path, options = {}) {
  return fetch(`${api}/api${path}`, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: { Origin: web, ...options.headers },
  });
}
const health = await request("/health");
assert.equal(health.status, 200, "后台健康检查未成功");
assert.equal((await health.json()).ok, true);
assert.equal(
  health.headers.get("access-control-allow-origin"),
  web,
  "后台 CORS 必须准确允许前台域名",
);
assert.equal(
  health.headers.get("access-control-allow-credentials"),
  "true",
  "后台必须允许带 Cookie 请求",
);
assert.match(
  health.headers.get("cache-control") || "",
  /no-store/,
  "后台 API 不能被缓存",
);
console.log("PASS 后台健康、准确的 CORS 域名与凭据设置、禁止缓存");
const preflight = await request("/users/login", {
  method: "OPTIONS",
  headers: {
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
  },
});
assert.ok(preflight.ok, "登录预检请求被拒绝");
assert.equal(preflight.headers.get("access-control-allow-origin"), web);
assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
assert.match(
  preflight.headers.get("access-control-allow-methods") || "",
  /POST/,
);
console.log("PASS 跨域登录预检");
const denied = await request("/entries");
assert.ok([401, 403].includes(denied.status), "匿名请求不应能读取家庭记录");
await denied.arrayBuffer();
const deniedOrigin = await request("/health", {
  headers: { Origin: "https://untrusted.invalid" },
});
assert.equal(
  deniedOrigin.headers.get("access-control-allow-origin"),
  null,
  "未授权网站不应获得 CORS 授权",
);
await deniedOrigin.arrayBuffer();
console.log("PASS 家庭记录与未授权 Origin 访问边界");
const publicEntries = await request("/public/entries");
assert.equal(publicEntries.status, 200);
const data = await publicEntries.json();
assert.ok(Array.isArray(data.docs));
for (const doc of data.docs) {
  for (const field of [
    "familyId",
    "originalText",
    "parentNote",
    "author",
    "editedBy",
    "editorName",
  ])
    assert.ok(!(field in doc), `公开 API 不应返回 ${field}`);
}
console.log("PASS 公开快照接口");
console.log(
  "只读检查通过。仍需在真实手机上验收登录、20MB 以上视频上传、播放、退出与公开撤回；本脚本不修改记录。",
);
