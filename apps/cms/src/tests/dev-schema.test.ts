import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { applyDevSchema } from "../lib/dev-schema";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE records(id INTEGER PRIMARY KEY,content TEXT NOT NULL);
    CREATE TABLE attachments(id INTEGER PRIMARY KEY,record_id INTEGER REFERENCES records(id) ON DELETE CASCADE);
    INSERT INTO records VALUES (1,'孩子最初的表达');INSERT INTO attachments VALUES(1,1);`);
  return db;
}
const rebuild = [
  "PRAGMA foreign_keys=OFF;",
  "CREATE TABLE `__new_records` (`id` INTEGER PRIMARY KEY,`content` TEXT NOT NULL,`new_note` TEXT DEFAULT '新字段默认值');",
  'INSERT INTO `__new_records`("id", "content", "new_note") SELECT "id", "content", "new_note" FROM `records`;',
  "DROP TABLE `records`;",
  "ALTER TABLE `__new_records` RENAME TO `records`;",
  "CREATE INDEX `records_content_idx` ON `records` (`content`);",
  "PRAGMA foreign_keys=ON;",
  "CREATE INDEX `records_content_idx` ON `records` (`content`);",
];
test("开发同步保留正文和级联附件，缺失新列使用默认值，重复索引只创建一次", () => {
  const db = fixture();
  try {
    applyDevSchema(db, rebuild);
    assert.equal(
      db.prepare("SELECT content FROM records").get()!.content,
      "孩子最初的表达",
    );
    assert.equal(
      db.prepare("SELECT new_note FROM records").get()!.new_note,
      "新字段默认值",
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM attachments").get()!.n,
      1,
    );
    assert.equal(db.prepare("PRAGMA foreign_keys").get()!.foreign_keys, 1);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    db.close();
  }
});
test("开发同步出错时回滚整批 DDL 与数据", () => {
  const db = fixture();
  try {
    assert.throws(() =>
      applyDevSchema(db, [...rebuild, "THIS IS INVALID SQL;"]),
    );
    assert.equal(
      db.prepare("SELECT content FROM records").get()!.content,
      "孩子最初的表达",
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM attachments").get()!.n,
      1,
    );
    assert.ok(
      !db
        .prepare("PRAGMA table_info(records)")
        .all()
        .some((c) => c.name === "new_note"),
    );
    assert.equal(db.prepare("PRAGMA foreign_keys").get()!.foreign_keys, 1);
  } finally {
    db.close();
  }
});
test("开发同步拒绝实际丢失数据或冲突索引", () => {
  const db = fixture();
  try {
    assert.throws(
      () => applyDevSchema(db, ["DELETE FROM records;"]),
      /记录数量/,
    );
    assert.throws(
      () =>
        applyDevSchema(db, [
          ...rebuild,
          "CREATE INDEX `records_content_idx` ON `records` (`id`);",
        ]),
      /冲突的索引/,
    );
    assert.equal(
      db.prepare("SELECT content FROM records").get()!.content,
      "孩子最初的表达",
    );
  } finally {
    db.close();
  }
});

test(
  "本地启动预检可建立空库、修复部分同步旧库并重复启动，生产模式拒绝改表",
  { timeout: 60000 },
  async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "mylife-dev-start-"));
    const filename = path.join(temp, "test.db");
    const env = {
      ...process.env,
      NODE_ENV: "development" as const,
      PAYLOAD_SECRET: randomBytes(32).toString("hex"),
      DATABASE_URL: `file:${filename}`,
      MEDIA_ROOT: path.join(temp, "media"),
      ORIGINALS_ROOT: path.join(temp, "originals"),
      MEDIA_WORKER_LOCK: path.join(temp, "worker.lock"),
    };
    const run = (extra = {}) =>
      promisify(execFile)(
        process.execPath,
        ["--import", "tsx", "src/scripts/dev-prepare.ts"],
        { cwd: process.cwd(), env: { ...env, ...extra }, timeout: 30000 },
      );
    const worker = (extra = {}) =>
      promisify(execFile)(
        process.execPath,
        ["--import", "tsx", "src/scripts/media-worker.ts", "--once"],
        {
          cwd: process.cwd(),
          env: { ...env, ...extra },
          timeout: 30000,
        },
      );
    try {
      await run();
      let db = new DatabaseSync(filename);
      db.exec(`INSERT INTO users(name,role,family_id,email) VALUES('测试孩子','child','local-test','dev@example.invalid');
      INSERT INTO entries(type,content,original_text,status,visibility,family_id,author_id,client_id) VALUES('quick','本地旧记录','最初的表达','saved','family','local-test',1,'local-entry');
      CREATE TABLE old_locked_rels(id INTEGER PRIMARY KEY,"order" INTEGER,parent_id INTEGER NOT NULL,path TEXT NOT NULL,users_id INTEGER,entries_id INTEGER,media_id INTEGER,spaces_id INTEGER,projects_id INTEGER,entry_history_id INTEGER);
      CREATE TABLE __new_payload_locked_documents_rels(id INTEGER PRIMARY KEY,family_services_id INTEGER);
      DROP TABLE payload_locked_documents_rels;
      ALTER TABLE old_locked_rels RENAME TO payload_locked_documents_rels;`);
      db.close();
      // A worker can consume the queue without trying to repair CMS lock metadata.
      await worker();
      await assert.rejects(access(env.MEDIA_WORKER_LOCK));
      db = new DatabaseSync(filename, { readOnly: true });
      assert.ok(
        !db
          .prepare("PRAGMA table_info(payload_locked_documents_rels)")
          .all()
          .some((c) => c.name === "family_services_id"),
      );
      db.close();
      await assert.rejects(
        worker({ DATABASE_URL: `file:${path.join(temp, "unprepared.db")}` }),
        /no such table/,
      );
      await assert.rejects(access(env.MEDIA_WORKER_LOCK));
      await run();
      await run();
      db = new DatabaseSync(filename, { readOnly: true });
      assert.equal(
        db.prepare("SELECT content FROM entries").get()!.content,
        "本地旧记录",
      );
      assert.equal(
        db.prepare("SELECT original_text FROM entries").get()!.original_text,
        "最初的表达",
      );
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get()!.n, 1);
      assert.ok(
        db
          .prepare("PRAGMA table_info(payload_locked_documents_rels)")
          .all()
          .some((c) => c.name === "family_services_id"),
      );
      assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
      db.close();
      const backups = await readdir(path.join(temp, "backups"));
      assert.equal(backups.length, 2);
      await assert.rejects(run({ NODE_ENV: "production" }), /仅用于本地开发/);
    } finally {
      await rm(temp, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  },
);
