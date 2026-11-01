process.env.MEDIA_STORAGE = "local";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import sharp from "sharp";
import { createLocalReq, handleEndpoints, type Payload } from "payload";
import { sql, type SQLiteAdapter } from "@payloadcms/db-sqlite";
import type { PublicEntry } from "@mylife/shared";
import type { Entry as PayloadEntry } from "../payload-types";
import { closePayload } from "../lib/shutdown";
import { publicEntryEndpoints } from "../lib/public-entries";

test(
  "家庭记录、两种隐私、游客详情、素材删除与真实媒体处理",
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
    const { localMediaPath, mediaKey, flushStorageDeletes } =
      await import("../lib/storage");
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
    const childPassword = randomBytes(20).toString("hex");
    const child = await payload.create({
      collection: "users",
      data: {
        name: "孩子",
        email: "child@example.invalid",
        password: childPassword,
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
    const sibling = await payload.create({
      collection: "users",
      data: {
        name: "同家庭的其他孩子",
        email: "sibling@example.invalid",
        password: randomBytes(20).toString("hex"),
        role: "child",
        familyId: family,
      },
      ...bootstrap,
    });
    const publicList = async () =>
      publicEntryEndpoints[0].handler(await createLocalReq({}, payload));
    const publicDetail = async (id: number | string) =>
      publicEntryEndpoints[1].handler(
        await createLocalReq(
          { req: { routeParams: { id: String(id) } } },
          payload,
        ),
      );
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
        "孩子可选择仅家庭可见，并保留原始表达",
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
      await t.test(
        "新发表默认公开，草稿保留发表选择，已有私密记录保持私密",
        async () => {
          const { visibility: _visibility, ...rawWithoutVisibility } = base();
          // Exercise a client that omits the field even though generated types require it.
          const withoutVisibility = rawWithoutVisibility as ReturnType<
            typeof base
          >;
          const published = await payload.create({
            collection: "entries",
            data: withoutVisibility,
            user: child,
            overrideAccess: false,
          });
          assert.equal(published.visibility, "public");
          assert.equal((await publicDetail(published.id)).status, 200);

          const draft = await payload.create({
            collection: "entries",
            data: {
              ...withoutVisibility,
              clientId: randomUUID(),
              status: "draft",
            },
            user: child,
            overrideAccess: false,
          });
          assert.equal(draft.visibility, "family");
          assert.equal(draft.publicRequested, true);
          assert.equal((await publicDetail(draft.id)).status, 404);
          const fromDraft = await payload.update({
            collection: "entries",
            id: draft.id,
            data: { status: "saved" },
            user: child,
            overrideAccess: false,
          });
          assert.equal(fromDraft.visibility, "public");
          assert.equal((await publicDetail(fromDraft.id)).status, 200);

          const privateDraft = await payload.create({
            collection: "entries",
            data: { ...base(), status: "draft", visibility: "family" },
            user: child,
            overrideAccess: false,
          });
          assert.equal(privateDraft.publicRequested, false);
          const privatePublished = await payload.update({
            collection: "entries",
            id: privateDraft.id,
            data: { status: "saved" },
            user: child,
            overrideAccess: false,
          });
          assert.equal(privatePublished.visibility, "family");
          assert.equal((await publicDetail(privatePublished.id)).status, 404);

          const legacy = await payload.create({
            collection: "entries",
            data: { ...base(), status: "draft", visibility: "family" },
            user: child,
            overrideAccess: false,
          });
          await (payload.db as unknown as SQLiteAdapter).drizzle.run(
            sql`UPDATE entries SET public_requested = 1, review_status = 'pending' WHERE id = ${legacy.id}`,
          );
          const legacyPublished = await payload.update({
            collection: "entries",
            id: legacy.id,
            data: { status: "saved" },
            user: child,
            overrideAccess: false,
          });
          assert.equal(legacyPublished.visibility, "family");
          assert.equal((await publicDetail(legacyPublished.id)).status, 404);
          assert.equal(
            (await payload.findByID({ collection: "entries", id: entry.id }))
              .visibility,
            "family",
          );
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
        "孩子无需预授权即可直接公开，修改立即更新，家长公开也无需审批，撤回立即清空",
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
          assert.equal(entry.visibility, "public");
          assert.equal(entry.reviewStatus, "approved");
          assert.equal(entry.publicRequested, false);
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
          assert.equal(entry.reviewStatus, "approved");
          assert.equal(
            (entry.publicSnapshot as { content: string }).content,
            "今天又练了一会儿。",
          );
          assert.equal(entry.originalText, "今天终于学会了骑自行车。");
          entry = await payload.update({
            collection: "entries",
            id: entry.id,
            data: { content: "家长帮忙补充的正文。" },
            user: parent,
            overrideAccess: false,
          });
          assert.equal(entry.visibility, "public");
          assert.equal(
            (entry.publicSnapshot as { content: string }).content,
            "家长帮忙补充的正文。",
          );
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
      await t.test("私密记录及历史只有记录人和同家庭家长可读", async () => {
        await assert.rejects(
          payload.findByID({
            collection: "entries",
            id: entry.id,
            user: sibling,
            overrideAccess: false,
          }),
        );
        const versions = await payload.findVersions({
          collection: "entries",
          where: { parent: { equals: entry.id } },
          user: sibling,
          overrideAccess: false,
        });
        assert.equal(versions.totalDocs, 0);
        for (const user of [child, parent]) {
          assert.equal(
            (
              await payload.findByID({
                collection: "entries",
                id: entry.id,
                user,
                overrideAccess: false,
              })
            ).id,
            entry.id,
          );
        }
      });
      await t.test(
        "游客可读公开列表及完整详情，私密、草稿、归档和撤回记录不可读",
        async () => {
          const published = await payload.create({
            collection: "entries",
            data: {
              ...base(),
              visibility: "public",
              reflection: "我很开心。",
              learning: "练习会进步。",
              tags: [{ label: "成长" }],
              parentNote: "只给家人看的补充。",
            },
            user: parent,
            overrideAccess: false,
          });
          const detail = await publicDetail(published.id);
          assert.equal(detail.status, 200);
          assert.equal(detail.headers.get("Cache-Control"), "no-store");
          const doc: PublicEntry = await detail.json();
          assert.equal(doc.id, published.id);
          assert.equal(doc.content, published.content);
          assert.equal(doc.reflection, "我很开心。");
          assert.equal(doc.learning, "练习会进步。");
          assert.deepEqual(doc.tags, [{ label: "成长" }]);
          for (const key of [
            "parentNote",
            "originalText",
            "familyId",
            "author",
            "editedBy",
            "clientId",
          ])
            assert.equal(key in doc, false);
          const list = await publicList();
          assert.equal(list.headers.get("Cache-Control"), "no-store");
          assert.ok(
            (await list.json()).docs.some(
              (item: PublicEntry) => item.id === published.id,
            ),
          );
          assert.equal((await publicDetail(entry.id)).status, 404);
          assert.equal((await publicDetail("invalid")).status, 404);
          assert.equal((await publicDetail(999999999)).status, 404);
          for (const status of ["draft", "archived"] as const) {
            const privateEntry = await payload.create({
              collection: "entries",
              data: { ...base(), status, visibility: "public" },
              user: child,
              overrideAccess: false,
            });
            assert.equal(privateEntry.visibility, "family");
            assert.equal(privateEntry.publicSnapshot, null);
            assert.equal((await publicDetail(privateEntry.id)).status, 404);
          }
          await payload.update({
            collection: "entries",
            id: published.id,
            data: { visibility: "family" },
            user: parent,
            overrideAccess: false,
          });
          assert.equal((await publicDetail(published.id)).status, 404);
          assert.ok(
            !(await (await publicList()).json()).docs.some(
              (item: PublicEntry) => item.id === published.id,
            ),
          );
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
            localMediaPath(mediaKey(media)),
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
            payload.findByID({
              collection: "media",
              id: media.id,
              user: sibling,
              overrideAccess: false,
            }),
          );
          await assert.rejects(
            payload.update({
              collection: "media",
              id: media.id,
              data: { alt: "越权读取" },
              user: sibling,
              overrideAccess: false,
            }),
          );
          await assert.rejects(
            payload.create({
              collection: "entries",
              data: { ...base(), media: [media.id] },
              user: sibling,
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
            data: { visibility: "public" },
            user: child,
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
          for (const user of [stranger, sibling]) {
            assert.equal(
              (
                await payload.findByID({
                  collection: "media",
                  id: media.id,
                  user,
                  overrideAccess: false,
                })
              ).id,
              media.id,
            );
          }
          const publicEntry: PublicEntry = await (
            await publicDetail(linked.id)
          ).json();
          assert.equal(publicEntry.media[0].id, media.id);
          assert.equal(publicEntry.media[0].url, media.url);
          assert.equal("owner" in publicEntry.media[0], false);
          assert.equal("familyId" in publicEntry.media[0], false);
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
          assert.equal((await publicDetail(linked.id)).status, 404);
        },
      );
      await t.test(
        "家长上传并关联到孩子记录的素材，记录人仍可读取",
        async () => {
          const image = await sharp({
            create: { width: 4, height: 4, channels: 3, background: "#aacc99" },
          })
            .png()
            .toBuffer();
          const media = await payload.create({
            collection: "media",
            data: { familyId: family },
            file: {
              data: image,
              name: "parent-photo.png",
              mimetype: "image/png",
              size: image.length,
            },
            user: parent,
            overrideAccess: false,
          });
          const ownEntry = await payload.create({
            collection: "entries",
            data: base(),
            user: child,
            overrideAccess: false,
          });
          await payload.update({
            collection: "entries",
            id: ownEntry.id,
            data: { media: [media.id] },
            user: parent,
            overrideAccess: false,
          });
          assert.equal(
            (
              await payload.findByID({
                collection: "media",
                id: media.id,
                user: child,
                overrideAccess: false,
              })
            ).id,
            media.id,
          );
          await payload.update({
            collection: "entries",
            id: ownEntry.id,
            data: { content: "孩子继续编辑自己的记录。" },
            user: child,
            overrideAccess: false,
          });
          await assert.rejects(
            payload.findByID({
              collection: "media",
              id: media.id,
              user: sibling,
              overrideAccess: false,
            }),
          );
        },
      );
      await t.test(
        "仅同家庭家长可删除闲置素材，关联记录和转码任务受保护，文件同步清理",
        async () => {
          const image = await sharp({
            create: { width: 4, height: 4, channels: 3, background: "#aacc99" },
          })
            .png()
            .toBuffer();
          const media = await payload.create({
            collection: "media",
            data: { familyId: family },
            file: {
              data: image,
              name: "delete-photo.png",
              mimetype: "image/png",
              size: image.length,
            },
            user: child,
            overrideAccess: false,
          });
          const deleteMedia = (user?: typeof parent) =>
            payload.delete({
              collection: "media",
              id: media.id,
              user,
              overrideAccess: false,
            });
          await assert.rejects(deleteMedia());
          await assert.rejects(deleteMedia(child));
          await assert.rejects(deleteMedia(stranger));
          for (const processingStatus of ["queued", "processing"] as const) {
            await payload.update({
              collection: "media",
              id: media.id,
              data: { processingStatus },
              context: { mediaWorker: true },
            });
            await assert.rejects(deleteMedia(parent), /排队或处理中/);
          }
          await payload.update({
            collection: "media",
            id: media.id,
            data: { processingStatus: "ready" },
            context: { mediaWorker: true },
          });
          const linked = await payload.create({
            collection: "entries",
            data: { ...base(), visibility: "public", media: [media.id] },
            user: child,
            overrideAccess: false,
          });
          await assert.rejects(deleteMedia(parent), /仍被成长记录使用/);
          await access(localMediaPath(mediaKey(media)));
          await payload.update({
            collection: "entries",
            id: linked.id,
            data: { media: [] },
            user: child,
            overrideAccess: false,
          });
          assert.deepEqual(
            (await (await publicDetail(linked.id)).json()).media,
            [],
          );
          await deleteMedia(parent);
          assert.equal((await flushStorageDeletes(payload, family)).pending, 0);
          await assert.rejects(
            payload.findByID({ collection: "media", id: media.id }),
          );
          await assert.rejects(access(localMediaPath(mediaKey(media))));
        },
      );
      await t.test(
        "视频可先提交，再由 FFmpeg 生成可播放优化版，成功后删除临时原件",
        async () => {
          const run = promisify(execFile);
          const input = path.join(temp, "sample.mp4");
          await run(process.env.FFMPEG_PATH || "ffmpeg", [
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
          const output = localMediaPath(mediaKey(processed));
          const probe = JSON.parse(
            (
              await run(process.env.FFPROBE_PATH || "ffprobe", [
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
          await assert.rejects(access(localMediaPath(mediaKey(media))));
        },
      );
      await t.test(
        "容器尾部长度不规范的视频可通过真实上传接口处理，并保留原始字节",
        async () => {
          const run = promisify(execFile);
          const input = path.join(temp, "faststart.mp4");
          await run(process.env.FFMPEG_PATH || "ffmpeg", [
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x240:rate=24",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=44100",
            "-t",
            "1",
            "-c:v",
            "libx264",
            "-threads",
            "1",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            input,
          ]);
          const source = await readFile(input);
          let offset = 0;
          while (source.toString("latin1", offset + 4, offset + 8) !== "mdat") {
            const size = source.readUInt32BE(offset);
            assert.ok(size >= 8 && offset + size < source.length);
            offset += size;
          }
          const declaredSize = source.readUInt32BE(offset);
          assert.ok(declaredSize > 169 + 8);
          assert.equal(offset + declaredSize, source.length);
          const malformed = Buffer.from(source);
          malformed.writeUInt32BE(declaredSize - 169, offset);

          await payload.create({
            collection: "family-services",
            data: { familyId: family, preserveOriginals: true },
            user: parent,
            overrideAccess: false,
          });
          const { token } = await payload.login({
            collection: "users",
            data: { email: child.email, password: childPassword },
          });
          assert.ok(token);
          const upload = async (bytes: Buffer) => {
            const body = new FormData();
            body.append(
              "_payload",
              JSON.stringify({
                alt: "video.mp4",
                originalSize: bytes.length,
                imageKind: "photo",
                recordCreatedAt: "2026-11-01T06:59:12.562Z",
              }),
            );
            body.append(
              "file",
              new Blob([new Uint8Array(bytes)], { type: "video/mp4" }),
              "video.mp4",
            );
            return handleEndpoints({
              config,
              request: new Request("http://localhost:3001/api/media", {
                method: "POST",
                headers: { Authorization: `JWT ${token}` },
                body,
              }),
            });
          };
          const response = await upload(malformed);
          assert.equal(response.status, 201, await response.clone().text());
          const result = await response.json();
          const media = await payload.findByID({
            collection: "media",
            id: result.doc.id,
            overrideAccess: true,
          });
          assert.equal(media.processingStatus, "queued");
          assert.equal(media.originalSize, malformed.length);
          assert.deepEqual(
            await readFile(localMediaPath(mediaKey(media))),
            source,
          );
          const { originalLocation } = await import("../lib/storage");
          assert.deepEqual(
            await readFile(originalLocation(media).local),
            malformed,
          );

          const invalid = await upload(source.subarray(0, 40));
          assert.equal(invalid.status, 400);
          const error = await invalid.json();
          assert.match(
            error.errors[0].data.errors[0].message,
            /Invalid or corrupted/,
          );

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
          const probe = JSON.parse(
            (
              await run(process.env.FFPROBE_PATH || "ffprobe", [
                "-v",
                "error",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
                localMediaPath(mediaKey(processed)),
              ])
            ).stdout,
          );
          assert.ok(
            probe.streams.some(
              (s: { codec_type: string }) => s.codec_type === "video",
            ),
          );
          assert.ok(
            probe.streams.some(
              (s: { codec_type: string }) => s.codec_type === "audio",
            ),
          );
          assert.ok(Number(probe.format.duration) >= 0.99);
          assert.deepEqual(
            await readFile(originalLocation(processed).local),
            malformed,
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
