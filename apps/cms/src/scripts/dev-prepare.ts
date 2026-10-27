import "dotenv/config";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SQLiteAdapter } from "@payloadcms/db-sqlite";
import { getPayload } from "payload";
import { applyDevSchema } from "../lib/dev-schema";
import { closePayload } from "../lib/shutdown";

if (process.env.NODE_ENV === "production")
  throw new Error(
    "dev:prepare 仅用于本地开发；生产环境请按部署文档执行数据库迁移。",
  );
const url = process.env.DATABASE_URL || "file:./data/mylife.db";
if (!url.startsWith("file:") || url.includes("?") || url.includes("#"))
  throw new Error("本地开发准备仅支持本地 SQLite 文件，不自动修改远程数据库。");
const filename = url.startsWith("file://")
  ? fileURLToPath(url)
  : path.resolve(url.slice(5));
await mkdir(path.dirname(filename), { recursive: true });
let db = new DatabaseSync(filename);
let dbOpen = true;
let savedBackup: string | undefined;
async function ensureBackup() {
  if (savedBackup) return;
  const folder = path.join(path.dirname(filename), "backups");
  await mkdir(folder, { recursive: true });
  savedBackup = path.join(
    folder,
    `pre-dev-schema-${new Date().toISOString().replaceAll(":", "-")}.db`,
  );
  await backup(db, savedBackup);
  console.log(`开发库已备份：${savedBackup}`);
}

Object.assign(process.env, { MYLIFE_MANAGED_SCHEMA: "true" });
const { default: config } = await import("../payload.config");
let payload: Awaited<ReturnType<typeof getPayload>> | undefined;
try {
  const tables = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((t) => String(t.name)),
  );
  if (
    tables.has("payload_migrations") &&
    Number(
      db
        .prepare("SELECT COUNT(*) AS n FROM payload_migrations WHERE batch>=0")
        .get()!.n,
    )
  )
    throw new Error(
      "这个数据库由生产迁移管理，不能使用开发同步修改。请使用隔离的本地开发库。",
    );
  const leftovers = [...tables]
    .filter((name) => name.startsWith("__new_"))
    .map((name) => ({ name }));
  for (const item of leftovers) {
    const table = String(item.name),
      original = table.slice("__new_".length);
    if (!tables.has(original))
      throw new Error(`发现 ${table}，请先检查上次同步状态，未自动删除。`);
    if (
      Number(
        db
          .prepare(`SELECT COUNT(*) AS n FROM "${table.replaceAll('"', '""')}"`)
          .get()!.n,
      )
    )
      throw new Error(
        `上次同步的临时表 ${table} 含数据，已停止；请保留数据库检查。`,
      );
    await ensureBackup();
    db.exec(`DROP TABLE "${table.replaceAll('"', '""')}";`);
  }
  // node:sqlite and libSQL bundle separate SQLite engines. Keep their file
  // handles disjoint, especially when the development database uses WAL.
  db.close();
  dbOpen = false;
  payload = await getPayload({ config });
  const adapter = payload.db as unknown as SQLiteAdapter;
  const pushSchema = adapter.requireDrizzleKit().pushSchema as unknown as (
    schema: unknown,
    drizzle: unknown,
  ) => Promise<{
    hasDataLoss: boolean;
    warnings: string[];
    statementsToExecute: string[];
  }>;
  const plan = await pushSchema(adapter.schema, adapter.drizzle);
  if (!Array.isArray(plan.statementsToExecute))
    throw new Error("当前适配器没有提供可检查的同步计划，未自动执行。");
  if (plan.hasDataLoss || plan.warnings.length)
    throw new Error(
      `开发同步需要人工检查，未自动接受数据删除：${plan.warnings.join("; ")}`,
    );
  await closePayload(payload);
  payload = undefined;
  db = new DatabaseSync(filename);
  dbOpen = true;
  if (plan.statementsToExecute.length) {
    await ensureBackup();
    applyDevSchema(db, plan.statementsToExecute);
  }
  const dev = db
    .prepare("SELECT id FROM payload_migrations WHERE batch=-1 LIMIT 1")
    .get();
  if (!dev)
    db.prepare(
      "INSERT INTO payload_migrations(name,batch) VALUES ('dev',-1)",
    ).run();
  console.log("本地数据库已就绪。");
} finally {
  try {
    if (payload) await closePayload(payload);
  } finally {
    if (dbOpen) db.close();
  }
}
process.exit(0);
