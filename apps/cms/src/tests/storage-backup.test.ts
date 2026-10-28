import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readdir,
  rm,
  mkdir,
  writeFile,
  access,
  readFile,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { unzipSync, zipSync } from "fflate";
import { createLocalReq, type Endpoint, type PayloadRequest } from "payload";
import { closePayload } from "../lib/shutdown";

test(
  "COS 日期目录、完整备份还原与清空的隔离和回滚",
  { timeout: 120000 },
  async (t) => {
    const temp = await mkdtemp(path.join(tmpdir(), "mylife-storage-"));
    Object.assign(process.env, {
      NODE_ENV: "production",
      PAYLOAD_SECRET: randomBytes(32).toString("hex"),
      DATABASE_URL: `file:${path.join(temp, "test.db")}`,
      MEDIA_ROOT: path.join(temp, "media"),
      ORIGINALS_ROOT: path.join(temp, "originals"),
      BACKUP_TEMP_ROOT: path.join(temp, "backups"),
      MEDIA_STORAGE: "cos",
      COS_SECRET_ID: "test-id",
      COS_SECRET_KEY: "test-key",
      COS_BUCKET: "test-1250000000",
      COS_REGION: "ap-nanjing",
      COS_CDN_ORIGIN: "https://anmy-story.icegl.cn",
    });
    process.env.COS_DOMAIN = "test-1250000000.cos.ap-nanjing.myqcloud.com";
    const { getPayload } = await import("payload");
    const { default: config } = await import("../payload.config");
    const payload = await getPayload({ config });
    const { migrations } = await import("../migrations");
    const storage = await import("../lib/storage");
    const { createFamilyArchive, zipArchive } = await import("../lib/archive");
    const { backupManagementEndpoints, unpackBackup } =
      await import("../lib/backup-management");
    const { encryptServiceKey, decryptServiceKey } = await import("../lib/ai");
    const objects = new Map<string, Buffer>();
    const cos = storage.cosClient() as any;
    cos.putObject = async (args: any) => {
      assert.equal(args.ACL, "private");
      assert.equal(
        args.Headers["Content-MD5"],
        createHash("md5").update(args.Body).digest("base64"),
      );
      objects.set(args.Key, Buffer.from(args.Body));
      return { ETag: createHash("md5").update(args.Body).digest("hex") };
    };
    cos.headObject = async (args: any) => {
      const bytes = objects.get(args.Key);
      if (!bytes) throw Error("missing");
      return {
        headers: { "content-length": String(bytes.length) },
        ETag: createHash("md5").update(bytes).digest("hex"),
      };
    };
    cos.getObject = async (args: any) => {
      if (!objects.has(args.Key)) throw Error("missing");
      return { Body: objects.get(args.Key) };
    };
    cos.deleteObject = async (args: any) => {
      objects.delete(args.Key);
      return {};
    };
    const family = randomUUID(),
      other = randomUUID();
    const makeUser = (role: "parent" | "child", familyId = family) =>
      payload.create({
        collection: "users",
        data: {
          name: role,
          email: `${randomUUID()}@test.invalid`,
          password: randomBytes(20).toString("hex"),
          role,
          familyId,
        },
        overrideAccess: true,
        context: { bootstrap: true },
      });
    try {
      await payload.db.migrate({
        migrations: migrations.map((m) => ({
          name: m.name,
          up: (args: unknown) => m.up(args as Parameters<typeof m.up>[0]),
          down: (args: unknown) => m.down(args as Parameters<typeof m.down>[0]),
        })),
      });
      const parent = await makeUser("parent"),
        child = await makeUser("child"),
        stranger = await makeUser("parent", other);
      const call = async (
        route: string,
        user: typeof parent | undefined,
        data?: Record<string, unknown>,
        bytes?: Uint8Array,
      ) => {
        const method = route === "/family/data" ? "get" : "post";
        const endpoint = backupManagementEndpoints.find(
          (e) => e.path === route && e.method === method,
        )!;
        return endpoint.handler(
          await createLocalReq(
            {
              user,
              req: {
                data,
                ...(bytes
                  ? {
                      file: {
                        name: "backup.zip",
                        mimetype: "application/zip",
                        size: bytes.length,
                        data: Buffer.from(bytes),
                      },
                    }
                  : {}),
              },
            },
            payload,
          ),
        );
      };
      const photo = await sharp({
        create: { width: 12, height: 8, channels: 3, background: "#eeaa22" },
      })
        .png()
        .toBuffer();
      const upload = (
        user = child,
        recordCreatedAt = "2020-02-02T16:10:00.000Z",
      ) =>
        payload.create({
          collection: "media",
          user,
          overrideAccess: false,
          data: { alt: "测试照片", familyId: user.familyId },
          file: {
            data: photo,
            name: "same.png",
            mimetype: "image/png",
            size: photo.length,
          },
          req: { data: { recordCreatedAt } },
        });
      await payload.create({
        collection: "family-services",
        user: parent,
        data: {
          familyId: family,
          preserveOriginals: true,
          endpoint: "https://example.invalid/v1",
          model: "backup-model",
          keyCipher: encryptServiceKey("private-test-service-key", family),
          consent: true,
        },
        context: { serviceSettings: true },
        overrideAccess: true,
      });
      const media = await upload(),
        second = await upload(),
        otherMedia = await upload(stranger);
      let entry = await payload.create({
        collection: "entries",
        user: child,
        overrideAccess: false,
        data: {
          type: "work",
          content: "备份前的正文",
          datePrecision: "unknown",
          familyId: family,
          author: child.id,
          clientId: randomUUID(),
          media: [media.id],
          coverMedia: media.id,
          visibility: "public",
          status: "saved",
        },
      });
      const project = await payload.create({
        collection: "projects",
        user: child,
        data: {
          title: "成长项目",
          status: "exploring",
          familyId: family,
          owner: child.id,
          cover: media.id,
          visibility: "public",
        },
        overrideAccess: false,
      });
      await payload.create({
        collection: "spaces",
        user: parent,
        data: {
          familyId: family,
          owner: child.id,
          displayName: "完整恢复主页",
          theme: "hachiware",
          avatar: media.id,
          cover: second.id,
          modules: { timeline: false, projects: true },
        },
        overrideAccess: false,
      });
      entry = await payload.update({
        collection: "entries",
        id: entry.id,
        user: child,
        overrideAccess: false,
        data: {
          content: "更新后的正文",
          media: [media.id, second.id],
          projects: [project.id],
          mainProject: project.id,
        },
      });
      await t.test(
        "用记录创建日期和上海时区归档；同名文件独立、COS 私有、CDN 签名包含 Host、本地无附件",
        async () => {
          assert.equal(media.prefix, "media/2020-02-03");
          assert.notEqual(media.filename, second.filename);
          assert.equal(media.storage, "cos");
          const url = new URL(media.url!);
          assert.equal(url.host, "anmy-story.icegl.cn");
          assert.equal(url.searchParams.get("q-header-list"), "host");
          assert.ok(objects.has(storage.mediaKey(media)));
          const original = await payload.findByID({
            collection: "media",
            id: media.id,
            overrideAccess: true,
          });
          assert.ok(
            original.originalFilename?.startsWith(
              "media/2020-02-03/originals/",
            ),
          );
          assert.deepEqual(objects.get(original.originalFilename!), photo);
          assert.equal(
            await readdir(path.join(temp, "media"))
              .catch(() => [])
              .then((x) => x.length),
            0,
          );
          const protectedMedia = await payload.update({
            collection: "media",
            id: media.id,
            user: child,
            overrideAccess: false,
            data: {
              prefix: "media/1900-01-01",
              _objectKey: "other-deployment",
              storage: "local",
              filename: otherMedia.filename,
              mimeType: "application/pdf",
              filesize: 1,
            },
          });
          assert.equal(protectedMedia.prefix, "media/2020-02-03");
          assert.equal(protectedMedia._objectKey, media._objectKey);
          assert.equal(protectedMedia.storage, "cos");
          assert.equal(protectedMedia.filename, media.filename);
          assert.equal(protectedMedia.mimeType, media.mimeType);
          assert.equal(protectedMedia.filesize, media.filesize);
        },
      );
      let zip: Uint8Array, contents: ReturnType<typeof unzipSync>;
      await t.test(
        "完整 ZIP 读取 COS 实际文件、原件、设置、主页、项目及历史，仅包含本家庭",
        async () => {
          const { dataset, files } = await createFamilyArchive(
            await createLocalReq({ user: parent }, payload),
          );
          assert.equal(dataset.settings?.apiKey, "private-test-service-key");
          assert.equal(dataset.profile?.theme, "hachiware");
          assert.equal(dataset.media.length, 2);
          assert.ok(dataset.recentVersions.length >= 2);
          assert.ok(dataset.history.length >= 2);
          assert.ok(!dataset.media.some((m) => m.id === otherMedia.id));
          zip = new Uint8Array(
            await new Response(zipArchive(files)).arrayBuffer(),
          );
          contents = unzipSync(zip);
          assert.deepEqual(
            Buffer.from(contents[dataset.media[0].originalPath!]),
            photo,
          );
          assert.ok(contents[`entries/${entry.id}.md`]);
          assert.deepEqual(
            JSON.parse(Buffer.from(contents["missing-files.json"]).toString()),
            [],
          );
        },
      );
      await t.test(
        "游客和孩子不能清空、预检或还原；跨家庭不能使用别人的预检令牌",
        async () => {
          for (const route of [
            "/family/data",
            "/family/data/clear",
            "/family/restore/preview",
            "/family/restore/apply",
          ])
            for (const user of [undefined, child])
              await assert.rejects(
                call(route, user),
                (e: any) => e.status === 403,
              );
          const preview = await (
            await call("/family/restore/preview", parent, undefined, zip)
          ).json();
          assert.equal(preview.records, 1);
          assert.equal(preview.media, 2);
          await assert.rejects(
            call("/family/restore/apply", stranger, {
              token: preview.token,
              confirmation: "还原整体备份",
            }),
            (e: any) => e.status === 400,
          );
          await assert.rejects(
            call("/family/data/clear", parent, { confirmation: "清空" }),
            (e: any) => e.status === 400,
          );
        },
      );
      await t.test(
        "拒绝路径穿越、附件缺失和哈希损坏，预检不改变现有资料",
        async () => {
          const unsafe = await mkdtemp(path.join(temp, "unsafe-"));
          await assert.rejects(
            unpackBackup(
              zipSync({ "../escape.txt": Buffer.from("bad") }),
              unsafe,
            ),
          );
          const bad = { ...contents! },
            index = JSON.parse(Buffer.from(bad["archive.json"]).toString());
          bad[index.media[0].archivePath] = Buffer.from("tampered");
          await assert.rejects(
            call("/family/restore/preview", parent, undefined, zipSync(bad)),
            /完整性校验/,
          );
          delete bad[index.media[0].archivePath];
          await assert.rejects(
            call("/family/restore/preview", parent, undefined, zipSync(bad)),
            /缺少/,
          );
          assert.equal(
            (await payload.findByID({ collection: "entries", id: entry.id }))
              .content,
            "更新后的正文",
          );
        },
      );
      await t.test(
        "还原中途失败会撤销清空与新数据，并清理新上传对象",
        async () => {
          const preview = await (
            await call("/family/restore/preview", parent, undefined, zip)
          ).json();
          const objectKeys = [...objects.keys()].sort();
          const hooks = payload.collections.entries.config.hooks!.afterChange!;
          hooks.push(({ req }) => {
            if (req.context.restoreArchive) throw Error("模拟还原后续写入失败");
          });
          try {
            await assert.rejects(
              call("/family/restore/apply", parent, {
                token: preview.token,
                confirmation: "还原整体备份",
              }),
              /模拟还原/,
            );
          } finally {
            hooks.pop();
          }
          assert.equal(
            (await payload.findByID({ collection: "entries", id: entry.id }))
              .content,
            "更新后的正文",
          );
          assert.deepEqual([...objects.keys()].sort(), objectKeys);
          assert.equal(
            (
              await payload.count({
                collection: "storage-cleanup",
                overrideAccess: true,
              })
            ).totalDocs,
            0,
          );
        },
      );
      await t.test(
        "整体还原替换当前资料并重映射所有附件、作者、项目、历史及服务密钥",
        async () => {
          const preview = await (
            await call("/family/restore/preview", parent, undefined, zip)
          ).json();
          const result = await (
            await call("/family/restore/apply", parent, {
              token: preview.token,
              confirmation: "还原整体备份",
            })
          ).json();
          assert.equal(result.restoredEntries, 1);
          assert.equal(result.restoredMedia, 2);
          assert.equal(result.cleanup.pending, 0);
          const entries = await payload.find({
            collection: "entries",
            where: { familyId: { equals: family } },
            depth: 0,
            overrideAccess: true,
          });
          assert.equal(entries.totalDocs, 1);
          const restored = entries.docs[0];
          assert.ok(restored.clientId?.startsWith("restore-"));
          assert.equal(restored.author, child.id);
          assert.equal(restored.visibility, "public");
          assert.equal(restored.originalText, "备份前的正文");
          assert.equal(restored.media?.length, 2);
          assert.ok(restored.media?.includes(restored.coverMedia!));
          const space = (
            await payload.find({
              collection: "spaces",
              where: { familyId: { equals: family } },
              depth: 0,
            })
          ).docs[0];
          assert.equal(space.theme, "hachiware");
          assert.equal(space.modules?.timeline, false);
          assert.equal(space.avatar, restored.coverMedia);
          const settings = (
            await payload.find({
              collection: "family-services",
              where: { familyId: { equals: family } },
              overrideAccess: true,
            })
          ).docs[0];
          assert.equal(
            decryptServiceKey(settings.keyCipher!, family),
            "private-test-service-key",
          );
          assert.equal(settings.preserveOriginals, true);
          const history = await payload.find({
            collection: "entry-history",
            where: { familyId: { equals: family } },
            depth: 0,
          });
          assert.ok(
            history.docs.some(
              (h) => (h.snapshot as any).content === "备份前的正文",
            ),
          );
          assert.ok(history.docs.every((h) => h.entry === restored.id));
          const restoredMedia = await payload.find({
            collection: "media",
            where: { familyId: { equals: family } },
            depth: 0,
          });
          for (const file of restoredMedia.docs) {
            assert.ok(objects.has(storage.mediaKey(file)));
            assert.equal(file.prefix, "media/2020-02-03");
          }
          assert.ok(objects.has(storage.mediaKey(otherMedia)));
        },
      );
      await t.test(
        "提交后的清理查询失败不会回滚或删除已还原的新文件",
        async () => {
          const preview = await (
            await call("/family/restore/preview", parent, undefined, zip)
          ).json();
          const find = payload.find.bind(payload);
          let fail = true;
          payload.find = ((args: any) => {
            if (args.collection === "storage-cleanup" && fail) {
              fail = false;
              throw Error("模拟提交后的清理查询失败");
            }
            return find(args);
          }) as typeof payload.find;
          let result: any;
          try {
            result = await (
              await call("/family/restore/apply", parent, {
                token: preview.token,
                confirmation: "还原整体备份",
              })
            ).json();
          } finally {
            payload.find = find;
          }
          assert.equal(result.restoredEntries, 1);
          assert.ok(result.cleanup.pending > 0);
          const media = await payload.find({
            collection: "media",
            where: { familyId: { equals: family } },
            depth: 0,
          });
          for (const file of media.docs)
            assert.ok(objects.has(storage.mediaKey(file)));
          assert.equal(
            (await storage.flushStorageDeletes(payload, family)).pending,
            0,
          );
          for (const file of media.docs)
            assert.ok(objects.has(storage.mediaKey(file)));
        },
      );
      await t.test(
        "家长清空全部版本、项目与云端素材，保留账号、设置和其他家庭；清理失败可持久重试",
        async () => {
          const deleteObject = cos.deleteObject;
          cos.deleteObject = async () => {
            throw Error("临时网络失败");
          };
          const result = await (
            await call("/family/data/clear", parent, {
              confirmation: "清空所有历史记录以及素材",
            })
          ).json();
          assert.equal(result.records, 0);
          assert.equal(result.media, 0);
          assert.equal(result.projects, 0);
          assert.equal(result.history, 0);
          assert.ok(result.pendingCleanup > 0);
          cos.deleteObject = deleteObject;
          assert.equal(
            (await storage.flushStorageDeletes(payload, family)).pending,
            0,
          );
          assert.equal(objects.size, 1);
          assert.ok(objects.has(storage.mediaKey(otherMedia)));
          assert.ok(
            await payload.findByID({ collection: "users", id: parent.id }),
          );
          const spaces = await payload.find({
            collection: "spaces",
            where: { familyId: { equals: family } },
            depth: 0,
          });
          assert.equal(spaces.docs[0].avatar, null);
          assert.equal(spaces.docs[0].cover, null);
          assert.equal(spaces.docs[0].theme, "hachiware");
          const nativeVersions = await payload.findVersions({
            collection: "entries",
            where: { "version.familyId": { equals: family } },
            overrideAccess: true,
          });
          assert.equal(nativeVersions.totalDocs, 0);
        },
      );
      await t.test(
        "迁移旧素材时保留其他环境的同名云端文件，连同原件安全迁移",
        async () => {
          process.env.MEDIA_STORAGE = "local";
          let legacy: Awaited<ReturnType<typeof upload>>;
          try {
            legacy = await upload(parent);
          } finally {
            process.env.MEDIA_STORAGE = "cos";
          }
          const legacyData = await payload.findByID({
            collection: "media",
            id: legacy.id,
            overrideAccess: true,
          });
          const localFile = storage.localMediaPath(storage.mediaKey(legacyData));
          const localOriginal = storage.originalLocation(legacyData).local;
          const originalBytes = await readFile(localOriginal);
          const storedBytes = await readFile(localFile);
          const collisionKey = `${storage.datePrefix(legacyData.createdAt)}/${legacyData.filename}`;
          const collisionBytes = Buffer.from("other environment");
          objects.set(collisionKey, collisionBytes);
          const { migrateMedia } = await import("../scripts/migrate-media");
          const preview = await migrateMedia(payload, false);
          assert.deepEqual(preview.missing, []);
          assert.equal(preview.migrated, 0);
          await access(localFile);
          assert.deepEqual(objects.get(collisionKey), collisionBytes);
          const result = await migrateMedia(payload, true);
          assert.deepEqual(result.missing, []);
          assert.equal(result.migrated, 1);
          const migrated = await payload.findByID({
            collection: "media",
            id: legacy.id,
            overrideAccess: true,
          });
          assert.equal(migrated.storage, "cos");
          assert.match(migrated._objectKey || "", /^[0-9a-f-]{36}$/);
          assert.deepEqual(objects.get(storage.mediaKey(migrated)), storedBytes);
          assert.deepEqual(objects.get(migrated.originalFilename!), originalBytes);
          assert.deepEqual(objects.get(collisionKey), collisionBytes);
          await assert.rejects(access(localFile));
          await assert.rejects(access(localOriginal));
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
