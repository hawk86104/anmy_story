import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

test("部署检查接受全部主题并拒绝未知主题", async () => {
  let theme = "usagi";
  const webOrigin = "https://web.example.invalid";
  const server = createServer((req, res) => {
    if (req.headers.origin === webOrigin) {
      res.setHeader("Access-Control-Allow-Origin", webOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.writeHead(204).end();
      return;
    }
    if (req.url === "/api/health") return res.end(JSON.stringify({ ok: true }));
    if (req.url === "/api/public/profile") return res.end(JSON.stringify({ displayName: "测试", modules: {}, theme }));
    if (req.url === "/api/public/entries" || req.url === "/api/public/projects") return res.end(JSON.stringify({ docs: [] }));
    res.writeHead(401).end(JSON.stringify({ error: "unauthorized" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const apiOrigin = `http://127.0.0.1:${server.address().port}`;
    for (theme of ["usagi", "hachiware", "chiikawa", "dashu"]) {
      const result = await run(process.execPath, ["scripts/verify-deployment.mjs", "--api-origin", apiOrigin, "--web-origin", webOrigin]);
      assert.match(result.stdout, /只读检查通过/);
    }
    theme = "unknown";
    await assert.rejects(run(process.execPath, ["scripts/verify-deployment.mjs", "--api-origin", apiOrigin, "--web-origin", webOrigin]));
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});
