process.env.MEDIA_STORAGE = "local";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import {
  createLocalReq,
  initTransaction,
  killTransaction,
  commitTransaction,
} from "payload";
import { sql, type SQLiteAdapter } from "@payloadcms/db-sqlite";
import { spawn } from "node:child_process";
import { closePayload } from "../lib/shutdown";

test("并发记录保护与外部历史资料导入", { timeout: 120000 }, async (t) => {
  const temp = await mkdtemp(path.join(tmpdir(), "mylife-reliability-"));
  Object.assign(process.env, {
    NODE_ENV: "production",
    PAYLOAD_SECRET: randomBytes(32).toString("hex"),
    DATABASE_URL: `file:${path.join(temp, "test.db")}`,
    MEDIA_ROOT: path.join(temp, "media"),
  });
  const { getPayload } = await import("payload");
  const { default: config } = await import("../payload.config");
  const payload = await getPayload({ config });
  const { migrations } = await import("../migrations");
  const { historyImportEndpoints, parseHistoryCSV } =
    await import("../lib/history-import");
  const family = randomUUID();
  const user = (role: "parent" | "child", familyId = family) =>
    payload.create({
      collection: "users",
      data: {
        email: `${randomUUID()}@test.invalid`,
        name: role,
        role,
        familyId,
        password: randomBytes(16).toString("hex"),
      },
      overrideAccess: true,
      context: { bootstrap: true },
    });
  try {
    await payload.db.migrate({
      migrations: migrations.map((migration) => ({
        name: migration.name,
        up: (args: unknown) =>
          migration.up(args as Parameters<typeof migration.up>[0]),
        down: (args: unknown) =>
          migration.down(args as Parameters<typeof migration.down>[0]),
      })),
    });
    const parent = await user("parent"),
      child = await user("child"),
      stranger = await user("parent", randomUUID());
    const entry = await payload.create({
      collection: "entries",
      user: child,
      overrideAccess: false,
      data: {
        type: "quick",
        content: "最初的表达",
        clientId: randomUUID(),
        datePrecision: "unknown",
        status: "saved",
        visibility: "public",
        familyId: family,
        author: child.id,
      },
    });
    const read = () =>
      payload.findByID({
        collection: "entries",
        id: entry.id,
        depth: 0,
        overrideAccess: false,
        user: child,
      });

    await t.test("Markdown 正文按原文保存，并保留公开快照和历史版本", async () => {
      const original = "# 一次旅行\n\n**开心**\n\n- 出发\n- 回家\n\n[照片](https://example.com/)";
      const next = `${original}\n\n> 值得记住的一天`;
      const created = await payload.create({
        collection: "entries",
        user: child,
        overrideAccess: false,
        data: {
          type: "story", content: original, clientId: randomUUID(),
          datePrecision: "unknown", status: "saved", visibility: "public",
          familyId: family, author: child.id,
        },
      });
      assert.equal(created.content, original);
      assert.equal(created.originalText, original);
      assert.equal((created.publicSnapshot as { content: string }).content, original);
      const updated = await payload.update({
        collection: "entries", id: created.id, user: child, overrideAccess: false,
        data: { content: next, revision: created.revision },
      });
      assert.equal(updated.content, next);
      assert.equal(updated.originalText, original);
      assert.equal((updated.publicSnapshot as { content: string }).content, next);
      const history = await payload.find({
        collection: "entry-history", where: { entry: { equals: created.id } },
        pagination: false, overrideAccess: true, depth: 0,
      });
      assert.equal((history.docs.find((item) => item.revision === 1)!.snapshot as { content: string }).content, original);
      assert.equal((history.docs.find((item) => item.revision === 2)!.snapshot as { content: string }).content, next);
    });

    await t.test(
      "同时保存同一版本只有一个成功；正文、公开快照与历史来自同一次写入",
      async () => {
        const outcomes = await Promise.allSettled(
          ["设备一的修改", "设备二的修改"].map((content) =>
            payload.update({
              collection: "entries",
              id: entry.id,
              user: child,
              overrideAccess: false,
              data: { content, revision: entry.revision },
            }),
          ),
        );
        assert.equal(
          outcomes.filter((r) => r.status === "fulfilled").length,
          1,
        );
        const failed = outcomes.find(
          (r) => r.status === "rejected",
        ) as PromiseRejectedResult;
        assert.equal(failed.reason.status, 409);
        const stored = await read();
        assert.equal(stored.revision, 2);
        assert.equal(stored.originalText, "最初的表达");
        assert.equal(
          (stored.publicSnapshot as { content: string }).content,
          stored.content,
        );
        const history = await payload.find({
          collection: "entry-history",
          where: { entry: { equals: entry.id } },
          pagination: false,
          overrideAccess: true,
          depth: 0,
        });
        assert.equal(history.docs.length, 2);
        assert.equal(
          (
            history.docs.find((r) => r.revision === 2)!.snapshot as {
              content: string;
            }
          ).content,
          stored.content,
        );
      },
    );

    await t.test("即使绕过文档前置检查，数据库也拒绝过期版本", async () => {
      const req = await createLocalReq({ user: child }, payload);
      await initTransaction(req);
      try {
        await assert.rejects(
          payload.db.updateOne({
            collection: "entries",
            id: entry.id,
            data: { revision: 2, content: "过期快照覆盖" },
            req,
          }),
          (e: any) => e.status === 409,
        );
      } finally {
        await killTransaction(req);
      }
      assert.equal((await read()).revision, 2);
      assert.notEqual((await read()).content, "过期快照覆盖");
    });

    await t.test("历史写入失败会回滚正文、版本号、标签与公开快照", async () => {
      const before = await read();
      const hooks = payload.collections["entry-history"].config.hooks!;
      hooks.beforeChange ||= [];
      hooks.beforeChange.push(({ req }) => {
        if (req.context.failHistory) throw new Error("测试历史写入失败");
      });
      try {
        await assert.rejects(
          payload.update({
            collection: "entries",
            id: entry.id,
            data: {
              content: "应整体撤销",
              revision: before.revision,
              tags: [{ label: "不能残留" }],
            },
            user: child,
            overrideAccess: false,
            context: { failHistory: true },
          }),
        );
      } finally {
        hooks.beforeChange.pop();
      }
      const after = await read();
      assert.equal(after.content, before.content);
      assert.equal(after.revision, before.revision);
      assert.deepEqual(after.publicSnapshot, before.publicSnapshot);
      assert.deepEqual(after.tags, before.tags);
    });

    await t.test("数据库提交失败会向调用方报错并释放写队列", async () => {
      const db = payload.db as unknown as SQLiteAdapter;
      await db.drizzle.run(
        sql`CREATE TABLE commit_failure (owner_id INTEGER REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED)`,
      );
      const req = await createLocalReq({ user: parent }, payload);
      await initTransaction(req);
      try {
        const session = db.sessions[String(await req.transactionID)]
          .db as unknown as SQLiteAdapter["drizzle"];
        await session.run(
          sql`INSERT INTO commit_failure (owner_id) VALUES (9999999)`,
        );
        await assert.rejects(commitTransaction(req), /FOREIGN KEY/);
      } finally {
        await killTransaction(req);
      }
      const rows = await db.drizzle.all(sql`SELECT * FROM commit_failure`);
      assert.equal(rows.length, 0);
    });

    await t.test(
      "其他进程短暂持有写锁时异步等待，提交后可继续保存",
      async () => {
        const before = await read();
        const process = spawn(
          globalThis.process.execPath,
          [
            "-e",
            "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec('BEGIN IMMEDIATE');console.log('locked');setTimeout(()=>{db.exec('COMMIT');db.close()},300)",
            path.join(temp, "test.db"),
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        try {
          await new Promise<void>((resolve, reject) => {
            process.stdout.once("data", () => resolve());
            process.once("error", reject);
            process.once("exit", (code) => {
              if (code) reject(new Error(`锁测试进程退出：${code}`));
            });
          });
          const saved = await payload.update({
            collection: "entries",
            id: entry.id,
            data: { content: "等待写锁后的修改", revision: before.revision },
            user: child,
            overrideAccess: false,
          });
          assert.equal(saved.revision, before.revision! + 1);
          assert.equal((await read()).content, "等待写锁后的修改");
        } finally {
          if (process.exitCode === null) process.kill();
        }
      },
    );

    const call = async (
      action: "preview" | "apply",
      data: Record<string, unknown>,
      actor: typeof parent | undefined = parent,
    ) => {
      const endpoint = historyImportEndpoints.find(
        (e) => e.path === `/family/import/${action}`,
      )!;
      return endpoint.handler(
        await createLocalReq(
          { user: actor, req: { data, url: "http://local/api/" } },
          payload,
        ),
      );
    };
    const input = (rows: unknown[], extra = {}) => ({
      source: "旧日记",
      format: "json",
      authorId: child.id,
      text: JSON.stringify(rows),
      ...extra,
    });
    const csv =
      'externalId,type,title,content,occurredAt,tags\r\nold-1,story,"旧日记,第一篇","今天说：""真开心""\n还有一个新发现",2020-05,探索|日记\r\nold-2,quick,一段回忆,小时候的发现,2019,回忆\r\nold-2,quick,重复,不应再次导入,2019,回忆';
    const csvInput = {
      source: "CSV 日记",
      format: "csv",
      authorId: child.id,
      text: csv,
    };

    await t.test(
      "CSV 支持引号、逗号、换行、模糊日期，预览不写入，文件内重复可识别",
      async () => {
        assert.equal(
          parseHistoryCSV(csv)[0].content,
          '今天说："真开心"\n还有一个新发现',
        );
        const count = await payload.count({
          collection: "entries",
          overrideAccess: true,
        });
        const response = await call("preview", csvInput);
        assert.equal(response.status, 200);
        const preview = await response.json();
        assert.equal(preview.ready, 2);
        assert.equal(preview.duplicates, 1);
        assert.equal(preview.errors, 0);
        assert.equal(preview.rows[0].datePrecision, "month");
        assert.equal(preview.rows[1].datePrecision, "year");
        assert.equal(
          (await payload.count({ collection: "entries", overrideAccess: true }))
            .totalDocs,
          count.totalDocs,
        );
        assert.throws(() => parseHistoryCSV('content\n"未闭合'));
        assert.throws(() => parseHistoryCSV("content,content\na,b"));
      },
    );

    await t.test(
      "导入归属选择的孩子、家长为修改人；重复导入跳过且不会覆盖后续修改",
      async () => {
        const result = await (await call("apply", csvInput)).json();
        assert.equal(result.created, 2);
        assert.equal(result.skipped, 1);
        const created = await payload.findByID({
          collection: "entries",
          id: result.entries[0].id,
          depth: 0,
        });
        assert.equal(created.author, child.id);
        assert.equal(created.editedBy, parent.id);
        assert.equal(created.visibility, "family");
        assert.equal(created.publicSnapshot, null);
        assert.equal(created.originalText, created.content);
        assert.equal(created.retrospective, true);
        await payload.update({
          collection: "entries",
          id: created.id,
          user: child,
          overrideAccess: false,
          data: { content: "后来补充的表达", revision: created.revision },
        });
        const again = await (await call("apply", csvInput)).json();
        assert.equal(again.created, 0);
        assert.equal(again.skipped, 3);
        assert.equal(
          (await payload.findByID({ collection: "entries", id: created.id }))
            .content,
          "后来补充的表达",
        );
      },
    );

    await t.test(
      "JSON 外部隐私、家庭和作者字段不能越权；所有导入先保持私密",
      async () => {
        const result = await (
          await call(
            "apply",
            input([
              {
                id: 9,
                content: "来自外部的正文",
                visibility: "public",
                familyId: stranger.familyId,
                author: stranger.id,
                originalText: "伪造原文",
                revision: 99,
              },
            ]),
          )
        ).json();
        const created = await payload.findByID({
          collection: "entries",
          id: result.entries[0].id,
          depth: 0,
        });
        assert.equal(created.familyId, family);
        assert.equal(created.author, child.id);
        assert.equal(created.visibility, "family");
        assert.equal(created.revision, 1);
        assert.equal(created.originalText, "来自外部的正文");
        assert.equal(
          (await call("preview", input([{ content: "x" }]), child)).status,
          403,
        );
        assert.equal(
          (await call("preview", input([{ content: "x" }]), stranger)).status,
          403,
        );
        assert.equal(
          (
            await call(
              "preview",
              input([{ content: "x" }], { authorId: stranger.id }),
            )
          ).status,
          403,
        );
      },
    );

    await t.test(
      "错误行阻止整个批次，后续钩子失败也不会残留前面的记录和历史",
      async () => {
        const count = await payload.count({
          collection: "entries",
          overrideAccess: true,
        });
        const invalid = input([
          { content: "合法第一条" },
          { content: "未来日期", occurredAt: "2999-01-01" },
        ]);
        assert.equal((await (await call("preview", invalid)).json()).errors, 1);
        assert.equal((await call("apply", invalid)).status, 400);
        const hooks = payload.collections.entries.config.hooks!;
        hooks.beforeChange!.push(({ data }) => {
          if (data.content === "触发晚期错误") throw new Error("测试批次撤销");
        });
        try {
          assert.equal(
            (
              await call(
                "apply",
                input([{ content: "批次第一条" }, { content: "触发晚期错误" }]),
              )
            ).status,
            500,
          );
        } finally {
          hooks.beforeChange!.pop();
        }
        assert.equal(
          (await payload.count({ collection: "entries", overrideAccess: true }))
            .totalDocs,
          count.totalDocs,
        );
        const history = await payload.find({
          collection: "entry-history",
          pagination: false,
          overrideAccess: true,
        });
        assert.ok(
          history.docs.every(
            (version) =>
              (version.snapshot as { content: string }).content !==
              "批次第一条",
          ),
        );
      },
    );
  } finally {
    await closePayload(payload);
    await rm(temp, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
