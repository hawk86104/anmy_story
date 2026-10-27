import type { DatabaseSync } from "node:sqlite";

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

function columns(value: string) {
  return value.split(",").map((column) => {
    const match = column.trim().match(/^["`]([a-zA-Z0-9_]+)["`]$/);
    if (!match) throw new Error("无法安全解析开发同步的列清单，已停止。");
    return match[1];
  });
}

// Drizzle's SQLite rebuild can select newly added columns from the old table,
// and emit CREATE INDEX twice. Keep the table-copy data and defaults intact.
export function prepareDevStatement(db: DatabaseSync, sql: string) {
  const copy = sql.match(
    /^INSERT INTO [`"](__new_[a-zA-Z0-9_]+)[`"]\((.+)\) SELECT (.+) FROM [`"]([a-zA-Z0-9_]+)[`"];?$/s,
  );
  if (!copy) return sql;
  const [, target, insert, select, source] = copy;
  if (target !== `__new_${source}`)
    throw new Error("开发同步的临时表与来源不匹配，已停止。");
  const to = columns(insert),
    from = columns(select);
  if (to.length !== from.length)
    throw new Error("开发同步的来源与目标列数不一致，已停止。");
  const existing = new Set(
    db
      .prepare(`PRAGMA table_info(${quote(source)})`)
      .all()
      .map((c) => String(c.name)),
  );
  const pairs = from.flatMap((column, i) =>
    existing.has(column) ? [[to[i], column]] : [],
  );
  if (!pairs.length) throw new Error("开发同步没有可保留的列，已停止。");
  return `INSERT INTO ${quote(target)} (${pairs.map(([c]) => quote(c)).join(",")}) SELECT ${pairs.map(([, c]) => quote(c)).join(",")} FROM ${quote(source)};`;
}

export function applyDevSchema(db: DatabaseSync, statements: string[]) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((t) => String(t.name))
    .filter(
      (name) => !name.startsWith("sqlite_") && !name.startsWith("__new_"),
    );
  const rowCounts = new Map(
    tables.map((name) => [
      name,
      Number(db.prepare(`SELECT COUNT(*) AS n FROM ${quote(name)}`).get()!.n),
    ]),
  );
  const foreignKeys = db.prepare("PRAGMA foreign_keys").get()!.foreign_keys;
  db.exec("PRAGMA foreign_keys=OFF;");
  let transaction = false;
  try {
    db.exec("BEGIN IMMEDIATE;");
    transaction = true;
    const indexes = new Map<string, string>();
    for (const statement of statements) {
      if (/^PRAGMA\s+foreign_keys\s*=/i.test(statement.trim())) continue;
      const index = statement.match(
        /^CREATE (?:UNIQUE )?INDEX [`"]([^`"]+)[`"]/i,
      );
      if (index) {
        const previous = indexes.get(index[1]);
        if (previous === statement) continue;
        if (previous) throw new Error("开发同步产生冲突的索引定义，已回滚。");
        indexes.set(index[1], statement);
      }
      db.exec(prepareDevStatement(db, statement));
    }
    for (const [table, count] of rowCounts) {
      if (
        Number(
          db.prepare(`SELECT COUNT(*) AS n FROM ${quote(table)}`).get()!.n,
        ) !== count
      )
        throw new Error(`开发同步改变了 ${table} 的记录数量，已回滚。`);
    }
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("开发同步的关联校验未通过，已回滚。");
    db.exec("COMMIT;");
    transaction = false;
  } catch (error) {
    if (transaction) db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec(`PRAGMA foreign_keys=${foreignKeys ? "ON" : "OFF"};`);
  }
}
