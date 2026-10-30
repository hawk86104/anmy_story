process.env.MEDIA_STORAGE = "local";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  readFile,
  mkdir,
  writeFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import type { SQLiteAdapter } from "@payloadcms/db-sqlite";
import sharp from "sharp";
import { unzipSync } from "fflate";
import { createLocalReq, type Payload, type Endpoint } from "payload";
import type { Entry, User } from "../payload-types";
import { closePayload } from "../lib/shutdown";

test(
  "旧库迁移、成长空间、项目、AI、原件与档案恢复",
  { timeout: 180000 },
  async (t) => {
    const temp = await mkdtemp(path.join(tmpdir(), "mylife-usagi-"));
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.PAYLOAD_SECRET = randomBytes(32).toString("hex");
    process.env.DATABASE_URL = `file:${path.join(temp, "test.db")}`;
    process.env.MEDIA_ROOT = path.join(temp, "media");
    process.env.ORIGINALS_ROOT = path.join(temp, "originals");
    const { getPayload } = await import("payload");
    const { default: config } = await import("../payload.config");
    const registered = (await import("../migrations")).migrations;
    const migrations = registered.map((m) => ({
      name: m.name,
      up: (args: unknown) => m.up(args as Parameters<typeof m.up>[0]),
      down: (args: unknown) => m.down(args as Parameters<typeof m.down>[0]),
    }));
    const payload: Payload = await getPayload({ config });
    const family = randomUUID(),
      otherFamily = randomUUID();
    const createUser = (
      email: string,
      role: "parent" | "child",
      familyId = family,
    ) =>
      payload.create({
        collection: "users",
        data: {
          name: role === "parent" ? "测试家长" : "测试孩子",
          email,
          password: randomBytes(20).toString("hex"),
          role,
          familyId,
        },
        overrideAccess: true,
        context: { bootstrap: true },
      });
    let parent: User, child: User, sibling: User, stranger: User;
    let entry: Entry, projectId: number, photoId: number;
    const call = async (
      endpoints: Endpoint[],
      route: string,
      user?: User,
      data?: Record<string, unknown>,
      method = "get",
      id?: number,
    ) => {
      const endpoint = endpoints.find(
        (e) => e.path === route && e.method === method,
      )!;
      assert.ok(endpoint, `${method} ${route}`);
      return endpoint.handler(
        await createLocalReq(
          {
            user,
            req: {
              data,
              routeParams: id ? { id: String(id) } : {},
              url: "http://local/api/",
            },
          },
          payload,
        ),
      );
    };
    try {
      await t.test(
        "生产模式从前一版 SQLite 迁移，原文、公开快照和版本号保留，重复迁移无变化",
        async () => {
          await payload.db.migrate({ migrations: migrations.slice(0, 3) });
          parent = await createUser("parent@usagi.invalid", "parent");
          child = await createUser("child@usagi.invalid", "child");
          const db = (payload.db as unknown as SQLiteAdapter).client;
          const snapshot = JSON.stringify({
            type: "quick",
            content: "升级前的公开记录",
            media: [],
            revision: 17,
          });
          await db.execute({
            sql: "INSERT INTO entries (id,content,original_text,type,status,visibility,review_status,family_id,author_id,client_id,revision,public_snapshot) VALUES (9001,?,?,?,?,?,?,?,?,?,?,?)",
            args: [
              "升级前的公开记录",
              "孩子最初的表达",
              "quick",
              "saved",
              "public",
              "approved",
              family,
              child.id,
              randomUUID(),
              17,
              snapshot,
            ],
          });
          await db.execute({
            sql: "INSERT INTO _entries_v (parent_id,version_type,version_content,version_original_text,version_family_id,version_author_id,version_client_id,version_revision,version_status,version_visibility,created_at,updated_at) VALUES (9001,?,?,?,?,?,?,?,?,?,?,?)",
            args: [
              "quick",
              "升级前保存的历史正文",
              "孩子最初的表达",
              family,
              child.id,
              randomUUID(),
              16,
              "saved",
              "family",
              new Date().toISOString(),
              new Date().toISOString(),
            ],
          });
          await payload.db.migrate({ migrations: migrations.slice(0, -1) });
          await db.execute({
            sql: "INSERT INTO spaces (family_id, owner_id) VALUES (?, ?)",
            args: [family, child.id],
          });
          await payload.db.migrate({ migrations });
          await payload.db.migrate({ migrations });
          const migratedSpace = await db.execute({
            sql: "SELECT entry_tag_options FROM spaces WHERE family_id = ?",
            args: [family],
          });
          assert.deepEqual(
            JSON.parse(String(migratedSpace.rows[0].entry_tag_options)),
            [
              "日常小事",
              "新的尝试",
              "我的作品",
              "运动一下",
              "读书时光",
              "小小进步",
            ],
          );
          const old = await payload.findByID({
            collection: "entries",
            id: 9001,
            depth: 0,
            user: child,
            overrideAccess: false,
          });
          assert.equal(old.originalText, "孩子最初的表达");
          assert.equal(old.revision, 17);
          assert.equal(old.content, "升级前的公开记录");
          assert.equal(
            (old.publicSnapshot as { content: string }).content,
            old.content,
          );
          assert.equal(
            (
              await payload.count({
                collection: "entry-history",
                overrideAccess: true,
              })
            ).totalDocs,
            1,
          );
        },
      );
      sibling = await createUser("sibling@usagi.invalid", "child");
      stranger = await createUser(
        "stranger@usagi.invalid",
        "parent",
        otherFamily,
      );
      const { familyEndpoints } = await import("../lib/family-endpoints");
      const { publicEntryEndpoints } = await import("../lib/public-entries");
      const ai = await import("../lib/ai");
      const { originalProof, verifiedOriginal } =
        await import("../lib/ai-proof");
      const archive = await import("../lib/archive");
      const { restoreFamilyArchive } = await import("../lib/restore");
      const { Media, mediaRoot, originalsRoot } =
        await import("../collections/Media");
      const { mediaReferences } = await import("../lib/media-links");
      const {
        originalLocation,
        localMediaPath,
        mediaKey,
        flushStorageDeletes,
      } = await import("../lib/storage");
      const photo = await sharp({
        create: { width: 24, height: 18, channels: 3, background: "#f6ce55" },
      })
        .png()
        .toBuffer();
      const upload = () =>
        payload.create({
          collection: "media",
          data: { familyId: family, alt: "测试照片" },
          file: {
            name: `${randomUUID()}.png`,
            mimetype: "image/png",
            data: photo,
            size: photo.length,
          },
          user: child,
          overrideAccess: false,
        });

      await t.test(
        "默认空间不泄露登录名；仅拥有者与同家庭家长可改，公开接口剔除内部字段",
        async () => {
          assert.equal(
            (await call(familyEndpoints, "/family/space")).status,
            401,
          );
          const created = await (
            await call(familyEndpoints, "/family/space", child)
          ).json();
          assert.equal(created.displayName, "我的成长手记");
          await call(
            familyEndpoints,
            "/family/space",
            child,
            {
              displayName: "小小探索家",
              theme: "hachiware",
              modules: { works: false },
              familyId: otherFamily,
            },
            "patch",
          );
          await assert.rejects(
            call(
              familyEndpoints,
              "/family/space",
              sibling,
              { displayName: "越权修改" },
              "patch",
            ),
          );
          const profile = await (
            await call(publicEntryEndpoints, "/public/profile")
          ).json();
          assert.equal(profile.displayName, "小小探索家");
          assert.equal(profile.theme, "hachiware");
          assert.equal(profile.modules.works, false);
          for (const key of ["owner", "familyId", "id", "email"])
            assert.ok(!(key in profile));
        },
      );
      await t.test("四套主题可保存并在公开资料中读取", async () => {
        for (const theme of ["usagi", "hachiware", "chiikawa", "dashu"]) {
          const saved = await (
            await call(familyEndpoints, "/family/space", child, { theme }, "patch")
          ).json();
          assert.equal(saved.theme, theme);
          const publicProfile = await (
            await call(publicEntryEndpoints, "/public/profile")
          ).json();
          assert.equal(publicProfile.theme, theme);
        }
        await assert.rejects(
          call(familyEndpoints, "/family/space", child, { theme: "unknown" }, "patch"),
        );
        await call(familyEndpoints, "/family/space", child, { theme: "hachiware" }, "patch");
      });
      await t.test(
        "家庭标签支持家长维护、家庭隔离及保留旧记录标签",
        async () => {
          assert.equal(
            (await call(familyEndpoints, "/family/entry-tags")).status,
            401,
          );
          const initial = await (
            await call(familyEndpoints, "/family/entry-tags", child)
          ).json();
          assert.ok(initial.tags.includes("小小进步"));
          assert.equal(
            (
              await call(
                familyEndpoints,
                "/family/entry-tags",
                child,
                { tags: ["越权"] },
                "patch",
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                familyEndpoints,
                "/family/entry-tags",
                parent,
                { tags: ["相同", " 相同 "] },
                "patch",
              )
            ).status,
            400,
          );
          const updated = await call(
            familyEndpoints,
            "/family/entry-tags",
            parent,
            { tags: [" 征文比赛 ", "获奖"] },
            "patch",
          );
          assert.equal(updated.status, 200);
          assert.deepEqual((await updated.json()).tags, ["征文比赛", "获奖"]);
          assert.deepEqual(
            (
              await (
                await call(familyEndpoints, "/family/entry-tags", child)
              ).json()
            ).tags,
            ["征文比赛", "获奖"],
          );
          const otherTags = await (
            await call(familyEndpoints, "/family/entry-tags", stranger)
          ).json();
          assert.ok(!otherTags.tags.includes("征文比赛"));
          const freshChild = await createUser(
            "fresh-child@usagi.invalid",
            "child",
            randomUUID(),
          );
          const freshTags = await (
            await call(familyEndpoints, "/family/entry-tags", freshChild)
          ).json();
          assert.ok(freshTags.tags.includes("小小进步"));
          const space = (
            await payload.find({
              collection: "spaces",
              where: { familyId: { equals: family } },
              user: child,
              overrideAccess: false,
            })
          ).docs[0];
          await payload.update({
            collection: "spaces",
            id: space.id,
            data: { entryTagOptions: ["越权"] },
            user: child,
            overrideAccess: false,
          });
          assert.deepEqual(
            (
              await (
                await call(familyEndpoints, "/family/entry-tags", child)
              ).json()
            ).tags,
            ["征文比赛", "获奖"],
          );
          const tagged = await payload.create({
            collection: "entries",
            user: child,
            overrideAccess: false,
            data: {
              type: "honor",
              content: "参加征文比赛",
              tags: [{ label: "征文比赛" }],
              status: "draft",
              datePrecision: "unknown",
              visibility: "family",
              familyId: family,
              author: child.id,
              clientId: randomUUID(),
            },
          });
          await call(
            familyEndpoints,
            "/family/entry-tags",
            parent,
            { tags: [] },
            "patch",
          );
          assert.deepEqual(
            (
              await (
                await call(familyEndpoints, "/family/entry-tags", child)
              ).json()
            ).tags,
            [],
          );
          const preserved = await payload.findByID({
            collection: "entries",
            id: tagged.id,
            user: child,
            overrideAccess: false,
          });
          assert.equal(preserved.tags?.[0].label, "征文比赛");
          await call(
            familyEndpoints,
            "/family/entry-tags",
            parent,
            { tags: ["征文比赛", "获奖"] },
            "patch",
          );
          const profile = await (
            await call(publicEntryEndpoints, "/public/profile")
          ).json();
          assert.ok(!("entryTagOptions" in profile));
        },
      );
      await t.test(
        "原件保留只影响新上传；后台保存精确原文件，孩子及其他家庭不能下载原件",
        async () => {
          assert.equal(
            (await call(ai.aiEndpoints, "/family/ai", child)).status,
            403,
          );
          const settings = await call(
            ai.aiEndpoints,
            "/family/ai",
            parent,
            { preserveOriginals: true },
            "post",
          );
          assert.equal(settings.status, 200);
          const media = await upload();
          photoId = media.id;
          const raw = await payload.findByID({
            collection: "media",
            id: media.id,
            overrideAccess: true,
          });
          assert.ok(raw.originalFilename);
          assert.deepEqual(await readFile(originalLocation(raw).local), photo);
          assert.notDeepEqual(
            await readFile(localMediaPath(mediaKey(raw))),
            photo,
          );
          assert.equal(
            (
              await call(
                Media.endpoints || [],
                "/:id/original",
                child,
                undefined,
                "get",
                media.id,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                Media.endpoints || [],
                "/:id/original",
                stranger,
                undefined,
                "get",
                media.id,
              )
            ).status,
            404,
          );
          const download = await call(
            Media.endpoints || [],
            "/:id/original",
            parent,
            undefined,
            "get",
            media.id,
          );
          assert.equal(download.status, 200);
          assert.deepEqual(Buffer.from(await download.arrayBuffer()), photo);
          const readable = await payload.findByID({
            collection: "media",
            id: media.id,
            user: parent,
            overrideAccess: false,
          });
          assert.equal(readable.originalFilename, undefined);
        },
      );
      await t.test(
        "项目与封面受家庭约束；只有公开项目进入游客 DTO，撤回封面立即受限",
        async () => {
          const project = await payload.create({
            collection: "projects",
            data: {
              title: "测试植物观察",
              cover: photoId,
              status: "exploring",
              visibility: "public",
              familyId: otherFamily,
              owner: stranger.id,
            },
            user: child,
            overrideAccess: false,
          });
          projectId = project.id;
          assert.equal(project.familyId, family);
          assert.equal(
            typeof project.owner === "number"
              ? project.owner
              : project.owner.id,
            child.id,
          );
          await assert.rejects(
            payload.update({
              collection: "projects",
              id: projectId,
              data: { title: "越权" },
              user: sibling,
              overrideAccess: false,
            }),
          );
          entry = await payload.create({
            collection: "entries",
            data: {
              type: "work",
              datePrecision: "unknown",
              title: "观察第一天",
              content: "今天观察了一片叶子。",
              status: "saved",
              visibility: "public",
              media: [photoId],
              coverMedia: photoId,
              projects: [projectId],
              mainProject: projectId,
              clientId: randomUUID(),
              familyId: family,
              author: child.id,
            },
            user: child,
            overrideAccess: false,
          });
          const detail = await (
            await call(
              publicEntryEndpoints,
              "/public/entries/:id",
              undefined,
              undefined,
              "get",
              entry.id,
            )
          ).json();
          assert.equal(detail.coverMedia.id, photoId);
          assert.equal(detail.projects[0].id, projectId);
          const req = await createLocalReq({ user: parent }, payload);
          assert.equal(await mediaReferences(photoId, req), 2);
          await assert.rejects(
            payload.delete({
              collection: "media",
              id: photoId,
              user: parent,
              overrideAccess: false,
            }),
          );
          await payload.update({
            collection: "projects",
            id: projectId,
            data: { visibility: "family" },
            user: child,
            overrideAccess: false,
          });
          const privateProject = await (
            await call(
              publicEntryEndpoints,
              "/public/entries/:id",
              undefined,
              undefined,
              "get",
              entry.id,
            )
          ).json();
          assert.equal(privateProject.projects.length, 0);
          await payload.update({
            collection: "entries",
            id: entry.id,
            data: { visibility: "family" },
            user: child,
            overrideAccess: false,
          });
          await assert.rejects(
            payload.findByID({
              collection: "media",
              id: photoId,
              overrideAccess: false,
            }),
          );
          const externalProject = await payload.create({
            collection: "projects",
            data: {
              title: "其他家庭项目",
              status: "exploring",
              visibility: "family",
              familyId: otherFamily,
              owner: stranger.id,
            },
            user: stranger,
            overrideAccess: false,
          });
          await assert.rejects(
            payload.update({
              collection: "entries",
              id: entry.id,
              data: { projects: [externalProject.id] },
              user: child,
              overrideAccess: false,
            }),
          );
        },
      );
      await t.test(
        "长期历史超过原生 100 版仍完整，其他家庭和其他孩子读不到",
        async () => {
          for (let i = 0; i < 101; i++)
            entry = await payload.update({
              collection: "entries",
              id: entry.id,
              data: { content: `观察记录第 ${i + 1} 次补充。` },
              depth: 0,
              user: child,
              overrideAccess: false,
            });
          const where = { entry: { equals: entry.id } };
          const history = await payload.find({
            collection: "entry-history",
            where,
            limit: 200,
            user: child,
            overrideAccess: false,
          });
          assert.ok(history.totalDocs > 100);
          assert.equal(
            (
              await payload.findVersions({
                collection: "entries",
                where: { parent: { equals: entry.id } },
                limit: 200,
                user: child,
                overrideAccess: false,
              })
            ).totalDocs,
            100,
          );
          for (const user of [sibling, stranger])
            assert.equal(
              (
                await payload.find({
                  collection: "entry-history",
                  where,
                  user,
                  overrideAccess: false,
                })
              ).totalDocs,
              0,
            );
        },
      );
      await t.test(
        "AI 默认关闭、授权校验、密钥不回传、请求格式与原文凭证绑定",
        async () => {
          assert.equal(
            (
              await call(
                ai.aiEndpoints,
                "/ai/suggest",
                child,
                { content: "原文" },
                "post",
              )
            ).status,
            409,
          );
          await assert.rejects(
            call(
              ai.aiEndpoints,
              "/family/ai",
              parent,
              { enabled: true },
              "post",
            ),
          );
          for (const endpoint of [
            "http://example.com/v1",
            "https://127.0.0.1/v1",
            "https://10.0.0.1/v1",
            "https://a.local/v1",
          ])
            assert.throws(() => ai.validateEndpoint(endpoint));
          const key = "test-secret-not-real";
          for (const address of [
            "127.0.0.1",
            "::1",
            "::ffff:7f00:1",
            "0:0:0:0:0:ffff:7f00:1",
            "fe80::1",
            "ff02::1",
          ])
            assert.equal(ai.publicAddress(address), false);
          assert.equal(ai.publicAddress("2606:4700:4700::1111"), true);
          const response = await call(
            ai.aiEndpoints,
            "/family/ai",
            parent,
            {
              enabled: true,
              endpoint: "https://provider.example/v1",
              model: "test-model",
              apiKey: key,
              consent: true,
              preserveOriginals: true,
            },
            "post",
          );
          const dto = await response.json();
          assert.equal(dto.keyConfigured, true);
          assert.ok(!JSON.stringify(dto).includes(key));
          const req = await createLocalReq({ user: parent }, payload);
          const service = (await ai.familyService(req))!;
          assert.ok(service.keyCipher && !service.keyCipher.includes(key));
          assert.equal(ai.decryptServiceKey(service.keyCipher, family), key);
          assert.throws(() =>
            ai.decryptServiceKey(service.keyCipher!, otherFamily),
          );
          let fetched = false;
          const fakeFetch: typeof fetch = async (input, options) => {
            fetched = true;
            assert.equal(
              String(input),
              "https://provider.example/v1/chat/completions",
            );
            assert.equal(
              new Headers(options?.headers).get("authorization"),
              `Bearer ${key}`,
            );
            assert.equal(options?.redirect, "error");
            return Response.json({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      titles: ["标题一", "标题二", "标题三"],
                      content: "今天观察了叶子。",
                    }),
                  },
                },
              ],
            });
          };
          const result = await ai.aiRequest(
            service,
            "chat/completions",
            JSON.stringify({ model: service.model }),
            "application/json",
            {
              fetcher: fakeFetch,
              resolver: (async () => [
                { address: "8.8.8.8", family: 4 },
              ]) as never,
            },
          );
          assert.ok(fetched);
          assert.equal(
            ai.parseSuggestion(JSON.parse(result.choices[0].message.content))
              .titles.length,
            3,
          );
          assert.throws(() =>
            ai.parseSuggestion({ titles: ["一个"], content: "正文" }),
          );
          await assert.rejects(
            ai.aiRequest(
              service,
              "chat/completions",
              "{}",
              "application/json",
              {
                fetcher: fakeFetch,
                resolver: (async () => [
                  { address: "127.0.0.1", family: 4 },
                ]) as never,
              },
            ),
          );
          const clientId = randomUUID(),
            proof = originalProof(
              "我看见一片叶子啦",
              child.id,
              family,
              clientId,
            );
          assert.equal(
            verifiedOriginal(proof, child.id, family, clientId),
            "我看见一片叶子啦",
          );
          assert.throws(() =>
            verifiedOriginal(proof, sibling.id, family, clientId),
          );
          const suggested = await payload.create({
            collection: "entries",
            data: {
              type: "quick",
              datePrecision: "unknown",
              visibility: "family",
              content: "今天观察了叶子。",
              status: "draft",
              familyId: family,
              author: child.id,
              clientId,
              ...({ aiOriginalToken: proof } as object),
            },
            user: child,
            overrideAccess: false,
          });
          assert.equal(suggested.originalText, "我看见一片叶子啦");
        },
      );
      await t.test(
        "流式 ZIP 含原文件、Markdown、历史、设置和缺失报告；排除其他家庭；旧版增量恢复保持私密",
        async () => {
          await assert.rejects(
            archive.createFamilyArchive(
              await createLocalReq({ user: child }, payload),
            ),
          );
          const req = await createLocalReq({ user: parent }, payload);
          const { dataset, files } = await archive.createFamilyArchive(req);
          assert.deepEqual(dataset.profile?.entryTagOptions, [
            "征文比赛",
            "获奖",
          ]);
          assert.equal(dataset.members.length, 3);
          assert.equal(dataset.settings?.apiKey, "test-secret-not-real");
          assert.ok(
            !JSON.stringify(dataset).includes("stranger@usagi.invalid"),
          );
          const bytes = new Uint8Array(
            await new Response(
              archive.zipArchive([
                ...files,
                { name: "missing.txt", path: path.join(temp, "missing") },
              ]),
            ).arrayBuffer(),
          );
          const content = unzipSync(bytes);
          assert.ok(content["archive.json"]);
          assert.ok(content[`entries/${entry.id}.md`]);
          assert.equal(
            JSON.parse(Buffer.from(content["missing-files.json"]).toString())
              .length,
            1,
          );
          const originalPath = dataset.media.find(
            (m) => m.id === photoId,
          )!.originalPath!;
          assert.deepEqual(Buffer.from(content[originalPath]), photo);
          const source = path.join(temp, "extracted");
          for (const [name, value] of Object.entries(content)) {
            const dest = path.join(source, name);
            await mkdir(path.dirname(dest), { recursive: true });
            await writeFile(dest, value);
          }
          const dry = await restoreFamilyArchive(payload, {
            source,
            familyId: otherFamily,
          });
          assert.equal(dry.applied, false);
          assert.equal(dry.restoredEntries, 0);
          assert.equal(dry.missingFiles.length, 0);
          const restored = await restoreFamilyArchive(payload, {
            source,
            familyId: otherFamily,
            apply: true,
          });
          assert.equal(restored.restoredEntries, dataset.entries.length);
          assert.equal(restored.restoredMedia, dataset.media.length);
          assert.deepEqual(
            (
              await (
                await call(familyEndpoints, "/family/entry-tags", stranger)
              ).json()
            ).tags,
            ["征文比赛", "获奖"],
          );
          assert.ok(restored.restoredHistory > 100);
          const restoredEntries = await payload.find({
            collection: "entries",
            where: { familyId: { equals: otherFamily } },
            user: stranger,
            overrideAccess: false,
            limit: 50,
          });
          assert.ok(
            restoredEntries.docs.every(
              (e) => e.visibility === "family" && e.publicSnapshot === null,
            ),
          );
          assert.ok(
            restoredEntries.docs.some(
              (e) => e.originalText === "孩子最初的表达" && e.revision === 17,
            ),
          );
          const restoredWork = restoredEntries.docs.find(
            (e) => e.type === "work",
          )!;
          assert.equal(restoredWork.media?.length, 1);
          assert.equal(restoredWork.projects?.length, 1);
          const index = JSON.parse(
            Buffer.from(content["archive.json"]).toString(),
          );
          index.media[0].archivePath = "../outside.png";
          await writeFile(
            path.join(source, "archive.json"),
            JSON.stringify(index),
          );
          await assert.rejects(
            restoreFamilyArchive(payload, { source, familyId: otherFamily }),
            /超出目录/,
          );
        },
      );
      await t.test(
        "未使用的原件随素材删除；最后一位家长不能被降级",
        async () => {
          const m = await upload();
          const raw = await payload.findByID({
            collection: "media",
            id: m.id,
            overrideAccess: true,
          });
          await access(originalLocation(raw).local);
          await payload.delete({
            collection: "media",
            id: m.id,
            user: parent,
            overrideAccess: false,
          });
          assert.equal((await flushStorageDeletes(payload, family)).pending, 0);
          await assert.rejects(access(originalLocation(raw).local));
          await assert.rejects(
            payload.update({
              collection: "users",
              id: parent.id,
              data: { role: "child" },
              user: parent,
              overrideAccess: false,
            }),
            /至少需要保留/,
          );
        },
      );
    } finally {
      await closePayload(payload);
      await rm(temp, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  },
);
