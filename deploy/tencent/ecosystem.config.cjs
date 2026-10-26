const path = require("node:path");
const repo = path.resolve(__dirname, "../..");
const cms = path.join(repo, "apps/cms");
module.exports = {
  apps: [
    {
      name: "anmy-cms",
      cwd: cms,
      script: path.join(repo, "node_modules/next/dist/bin/next"),
      args: "start --hostname 127.0.0.1 --port 3001",
      interpreter: process.execPath,
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1G",
      time: true,
      kill_timeout: 10000,
    },
    {
      name: "anmy-media",
      cwd: cms,
      script: path.join(repo, "node_modules/tsx/dist/cli.mjs"),
      args: "src/scripts/media-worker.ts",
      interpreter: process.execPath,
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "768M",
      time: true,
      kill_timeout: 15000,
    },
  ],
};
