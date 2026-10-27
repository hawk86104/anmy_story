import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// npm workspaces hoists dependencies to the repository root. The EdgeOne
// adapter also scans this app directory while copying standalone dependencies.
await mkdir(new URL("../apps/web/node_modules/", import.meta.url), {
  recursive: true,
});

const worker = await readFile(
  new URL("../apps/web/src/lib/service-worker.js", import.meta.url),
  "utf8",
);
const hash = createHash("sha256").update(worker);
for (const asset of [
  "offline.html",
  "offline.css",
  "offline-draft.js",
  "app-icon.svg",
])
  hash.update(
    await readFile(new URL(`../apps/web/public/${asset}`, import.meta.url)),
  );
await writeFile(
  new URL("../apps/web/public/sw.js", import.meta.url),
  worker.replaceAll("__SHELL_VERSION__", hash.digest("hex").slice(0, 16)),
);
