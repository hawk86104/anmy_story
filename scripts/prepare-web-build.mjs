import { mkdir } from "node:fs/promises";

// npm workspaces hoists dependencies to the repository root. The EdgeOne
// adapter also scans this app directory while copying standalone dependencies.
await mkdir(new URL("../apps/web/node_modules/", import.meta.url), {
  recursive: true,
});
