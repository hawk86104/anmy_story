import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import sharp from "sharp";
import type { Payload } from "payload";
import type { Entry as PayloadEntry } from "../payload-types";
import { closePayload } from "../lib/shutdown";

test(
  "家庭记录、权限、原文、审核快照与真实媒体处理",
  { timeout: 180000 },
  async (t) => {
    const temp = await mkdtemp(path.join(tmpdir(), "mylife-test-"));
    process.env.PAYLOAD_SECRET = randomBytes(32).toString("hex");
    process.env.DATABASE_URL = `file:${path.join(temp, "test.db")}`;
    process.env.MEDIA_ROOT = path.join(temp, "media");
    process.env.MEDIA_WORKER_LOCK = path.join(temp, "worker.lock");
    const { getPayload } = await import("payload");
    const { default: config } = await import("../payload.config");
    const payload: Payload = await getPayload({ config });
    const family = randomUUID(),
      otherFamily = randomUUID();
    const bootstrap = { overrideAccess: true, context: { bootstrap: true } };
    const parent = await payload.create({
      collection: "users",
      data: {
        name: "家长",
        email: "parent@example.invalid",
        password: randomBytes(20).toString("hex"),
        role: "parent",
        familyId: family,
      },
      ...bootstrap,
    });
    const child = await payload.create({
      collection: "users",
      data: {
        name: "孩子",
        email: "child@example.invalid",
        password: randomBytes(20).toString("hex"),
        role: "child",
        familyId: family,
      },
      ...bootstrap,
    });
    const stranger = await payload.create({
      collection: "users",
      data: {
        name: "其他家庭",
        email: "other@example.invalid",
        password: randomBytes(20).toString("hex"),
        role: "parent",
        familyId: otherFamily,
      },
      ...bootstrap,
    });
    const base = () => ({
      type: "quick" as const,
      content: "今天终于学会了骑自行车。",
      status: "saved" as const,
      visibility: "family" as const,
      datePrecision: "day" as const,
      occurredAt: "2020-05-06T00:00:00.000Z",
      clientId: randomUUID(),
      familyId: family,
      author: child.id,
    });
    let entry: PayloadEntry;
    try {
      await t.test(
        "孩子提交立即保存，默认家庭可见，并保留原始表达",
        async () => {
          entry = await payload.create({
            collection: "entries",
            data: {
              ...base(),
              originalText: "不能伪造的原文",
              familyId: otherFamily,
              author: stranger.id,
              publicSnapshot: { content: "恶意公开" },
            },
            user: child,
            overrideAccess: false,
          });
          assert.equal(entry.status, "saved");
          assert.equal(entry.visibility, "family");
          assert.equal(entry.originalText, "今天终于学会了骑自行车。");
          assert.equal(entry.familyId, family);
          assert.equal(
            typeof entry.author === "number" ? entry.author : entry.author.id,
            child.id,
          );
          assert.equal(entry.publicSnapshot, null);
        },
      );
      await t.test("未登录与其他家庭不能读取记录、修改记录或版本", async () => {
        await assert.rejects(
          payload.find({ collection: "entries", overrideAccess: false }),
        );
        const other = await payload.find({
          collection: "entries",
          user: stranger,
          overrideAccess: false,
        });
        assert.equal(other.totalDocs, 0);
        await assert.rejects(
          payload.findByID({
            collection: "entries",
            id: entry.id,
            user: stranger,
            overrideAccess: false,
          }),
        );
        await assert.rejects(
          payload.update({
            collection: "entries",
            id: entry.id,
            data: { content: "越权修改" },
            user: stranger,
            overrideAccess: false,
          }),
        );
        const versions = await payload.findVersions({
          collection: "entries",
          user: stranger,
          overrideAccess: false,
        });
        assert.equal(versions.totalDocs, 0);
      });
      await t.test(
        "公开请求不自动公开，家长审批生成快照；编辑保留已批准版本，撤回立即清空",
        async () => {
          entry = await payload.update({
            collection: "entries",
            id: entry.id,
            data: {
              visibility: "public",
              reviewStatus: "approved",
              publicSnapshot: { content: "伪造快照" },
            },
            user: child,
            overrideAccess: false,
          });
          assert.equal(entry.visibility, "family");
          assert.equal(entry.reviewStatus, "pending");
          assert.equal(entry.publicSnapshot, null);
          entry = await payload.update({
            collection: "entries",
            id: entry.id,
            data: { visibility: "public", reviewStatus: "approved" },
            user: parent,
            overrideAccess: false,
          });
          assert.equal(entry.visibility, "public");
          assert.equal(
            (entry.publicSnapshot as { content: string }).content,
            "今天终于学会了骑自行车。",
          );
          entry = await payload.update({
            collection: "entries",
            id: entry.id,
            data: {
              content: "今天又练了一会儿。",
              visibility: "public",
              originalText: "原文不许被覆盖",
            },
            user: child,
            overrideAccess: false,
          });
          assert.equal(entry.reviewStatus, "pending");
          assert.equal(
            (entry.publicSnapshot as { content: string }).content,
            "今天终于学会了骑自行车。",
          );
          assert.equal(entry.originalText, "今天终于学会了骑自行车。");
          entry = await payload.update({
            collection: "entries",
            id: entry.id,
            data: { visibility: "family" },
            user: child,
            overrideAccess: false,
          });
          assert.equal(entry.publicSnapshot, null);
          assert.equal(entry.publicRequested, false);
        },
      );
      await t.test("孩子无法提升账号角色、预授权或更改所属家庭", async () => {
        const updated = await payload.update({
          collection: "users",
          id: child.id,
          data: {
            role: "parent",
            allowPublicPublishing: true,
            familyId: otherFamily,
          },
          user: child,
          overrideAccess: false,
        });
        assert.equal(updated.role, "child");
        assert.equal(updated.allowPublicPublishing, false);
        assert.equal(updated.familyId, family);
      });
      await t.test(
        "家长可添加同家庭的第二位家长，孩子不能建账号或修改家长记录",
        async () => {
          const secondParent = await payload.create({
            collection: "users",
            data: {
              name: "另一位家长",
              email: "parent2@example.invalid",
              password: randomBytes(20).toString("hex"),
              role: "parent",
              familyId: otherFamily,
            },
            user: parent,
            overrideAccess: false,
          });
          assert.equal(secondParent.familyId, family);
          assert.equal(secondParent.role, "parent");
          await assert.rejects(
            payload.create({
              collection: "users",
              data: {
                name: "越权账号",
                email: "forbidden@example.invalid",
                password: randomBytes(20).toString("hex"),
                role: "parent",
                familyId: family,
              },
              user: child,
              overrideAccess: false,
            }),
          );
          const parentEntry = await payload.create({
            collection: "entries",
            data: base(),
            user: secondParent,
            overrideAccess: false,
          });
          await assert.rejects(
            payload.update({
              collection: "entries",
              id: parentEntry.id,
              data: { content: "越权编辑家长原话" },
              user: child,
              overrideAccess: false,
            }),
          );
          const edited = await payload.update({
            collection: "entries",
            id: entry.id,
            data: { parentNote: "第二位家长的观察" },
            user: secondParent,
            overrideAccess: false,
          });
          assert.equal(edited.editorName, "另一位家长");
        },
      );
      await t.test(
        "日期精度不虚构具体日期，未知日期为空，空记录及未来日期被拒绝",
        async () => {
          const year = await payload.create({
            collection: "entries",
            data: {
              ...base(),
              occurredAt: "2018-10-20",
              datePrecision: "year",
            },
            user: child,
            overrideAccess: false,
          });
          assert.equal(year.occurredAt?.slice(0, 10), "2018-01-01");
          const unknown = await payload.create({
            collection: "entries",
            data: {
              ...base(),
              datePrecision: "unknown",
              dateNote: "小学某个暑假",
            },
            user: child,
            overrideAccess: false,
          });
          assert.equal(unknown.occurredAt, null);
          await assert.rejects(
            payload.create({
              collection: "entries",
              data: { ...base(), content: "" },
              user: child,
              overrideAccess: false,
            }),
          );
          await assert.rejects(
            payload.create({
              collection: "entries",
              data: { ...base(), occurredAt: "2099-01-01" },
              user: child,
              overrideAccess: false,
            }),
          );
        },
      );
      await t.test(
        "过期修改被拒绝，重复提交不会产生第二条记录，家长修改留下版本",
        async () => {
          await assert.rejects(
            payload.update({
              collection: "entries",
              id: entry.id,
              data: { content: "旧草稿", revision: 1 },
              user: child,
              overrideAccess: false,
            }),
            /已有新版本/,
          );
          await assert.rejects(
            payload.create({
              collection: "entries",
              data: { ...base(), clientId: entry.clientId },
              user: child,
              overrideAccess: false,
            }),
          );
          await payload.update({
            collection: "entries",
            id: entry.id,
            data: { parentNote: "这是家长补充。" },
            user: parent,
            overrideAccess: false,
          });
          const versions = await payload.findVersions({
            collection: "entries",
            where: { parent: { equals: entry.id } },
            user: parent,
            overrideAccess: false,
            limit: 100,
          });
          assert.ok(versions.totalDocs >= 5);
        },
      );
      await t.test(
        "图片真实缩放、转换 WebP，未公开附件不能越权访问或跨家庭关联",
        async () => {
          const image = await sharp({
            create: {
              width: 3000,
              height: 1600,
              channels: 3,
              background: "#aacc99",
            },
          })
            .jpeg()
            .toBuffer();
          const media = await payload.create({
            collection: "media",
            data: { alt: "一次真实图片上传", familyId: family },
            file: {
              data: image,
              name: "photo.jpg",
              mimetype: "image/jpeg",
              size: image.length,
            },
            user: child,
            overrideAccess: false,
          });
          assert.equal(media.mimeType, "image/webp");
          assert.ok((media.width || 0) <= 2048);
          assert.equal(media.processingStatus, "ready");
          const stored = await sharp(
            path.join(temp, "media", media.filename!),
          ).metadata();
          assert.equal(stored.format, "webp");
          assert.equal(stored.exif, undefined);
          await assert.rejects(
            payload.find({ collection: "media", overrideAccess: false }),
          );
          await assert.rejects(
            payload.findByID({
              collection: "media",
              id: media.id,
              user: stranger,
              overrideAccess: false,
            }),
          );
          await assert.rejects(
            payload.create({
              collection: "entries",
              data: { ...base(), media: [media.id] },
              user: stranger,
              overrideAccess: false,
            }),
          );
          await assert.rejects(
            payload.update({
              collection: "media",
              id: media.id,
              data: {},
              file: {
                data: image,
                name: "overwrite.jpg",
                mimetype: "image/jpeg",
                size: image.length,
              },
              user: child,
              overrideAccess: false,
            }),
          );
          const linked = await payload.create({
            collection: "entries",
            data: { ...base(), media: [media.id] },
            user: child,
            overrideAccess: false,
          });
          await payload.update({
            collection: "entries",
            id: linked.id,
            data: { visibility: "public", reviewStatus: "approved" },
            user: parent,
            overrideAccess: false,
          });
          assert.equal(
            (
              await payload.findByID({
                collection: "media",
                id: media.id,
                overrideAccess: false,
              })
            ).id,
            media.id,
          );
          await payload.update({
            collection: "entries",
            id: linked.id,
            data: { visibility: "family" },
            user: child,
            overrideAccess: false,
          });
          await assert.rejects(
            payload.findByID({
              collection: "media",
              id: media.id,
              overrideAccess: false,
            }),
          );
        },
      );
      await t.test(
        "视频可先提交，再由 FFmpeg 生成可播放优化版，成功后删除临时原件",
        async () => {
          const run = promisify(execFile);
          const input = path.join(temp, "sample.mp4");
          await run("ffmpeg", [
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=1600x900:rate=24",
            "-t",
            "1",
            "-c:v",
            "libx264",
            "-threads",
            "1",
            "-pix_fmt",
            "yuv420p",
            input,
          ]);
          const source = await readFile(input);
          const media = await payload.create({
            collection: "media",
            data: { alt: "测试视频", familyId: family },
            file: {
              data: source,
              name: "sample.mp4",
              mimetype: "video/mp4",
              size: source.length,
            },
            user: child,
            overrideAccess: false,
          });
          assert.equal(media.processingStatus, "queued");
          const saved = await payload.create({
            collection: "entries",
            data: { ...base(), media: [media.id] },
            user: child,
            overrideAccess: false,
          });
          assert.equal(saved.status, "saved");
          await run(
            process.execPath,
            ["--import", "tsx", "src/scripts/media-worker.ts", "--once"],
            { cwd: process.cwd(), env: process.env, timeout: 60000 },
          );
          const processed = await payload.findByID({
            collection: "media",
            id: media.id,
          });
          assert.equal(processed.processingStatus, "ready");
          const output = path.join(temp, "media", processed.filename!);
          const probe = JSON.parse(
            (
              await run("ffprobe", [
                "-v",
                "error",
                "-show_streams",
                "-of",
                "json",
                output,
              ])
            ).stdout,
          );
          assert.ok(probe.streams[0].width <= 1280);
          assert.ok(probe.streams[0].height <= 720);
          assert.equal(probe.streams[0].codec_name, "h264");
          await assert.rejects(
            access(path.join(temp, "media", media.filename!)),
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
  },
);
