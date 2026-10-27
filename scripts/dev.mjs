import { spawn } from "node:child_process";
const children = [];
function start(script) {
  const npmCLI = process.env.npm_execpath;
  const child = spawn(
    npmCLI ? process.execPath : "npm",
    npmCLI ? [npmCLI, "run", script] : ["run", script],
    {
      stdio: "inherit",
      detached: process.platform !== "win32",
      shell: !npmCLI && process.platform === "win32",
      windowsHide: true,
      env: { ...process.env, MYLIFE_MANAGED_SCHEMA: "true" },
    },
  );
  children.push(child);
  child.once("exit", () => children.splice(children.indexOf(child), 1));
  child.on("error", (error) => {
    console.error(`[dev] ${script} 启动失败：${error.message}`);
    stop(1);
  });
  return child;
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const p of children) {
    if (!p.pid) continue;
    try {
      if (process.platform === "win32")
        spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      else process.kill(-p.pid, "SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(code), 3500).unref();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
console.log("[dev] 正在准备本地数据库…");
const prepared = await new Promise((resolve) =>
  start("dev:prepare").on("exit", (code) => resolve(code === 0)),
);
if (!prepared) stop(1);
else if (!stopping) {
  console.log("[dev] 数据库就绪，启动前台、后台和媒体处理。");
  for (const script of ["dev:cms", "dev:web", "media:worker"])
    start(script).on("exit", (code) => stop(code || 0));
}
