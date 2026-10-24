import { spawn } from "node:child_process";
const children = ["dev:cms", "dev:web", "media:worker"].map((script) =>
  spawn("npm", ["run", script], {
    stdio: "inherit",
    detached: process.platform !== "win32",
    shell: process.platform === "win32",
  }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of children) {
    if (!p.pid) continue;
    try {
      if (process.platform === "win32")
        spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"]);
      else process.kill(-p.pid, "SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(code), 3500).unref();
}
for (const child of children) child.on("exit", (code) => stop(code || 0));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
