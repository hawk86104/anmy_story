import path from "node:path";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { Zip, ZipPassThrough } from "fflate";
import { APIError, type Endpoint, type PayloadRequest } from "payload";
import { entryTitle } from "@mylife/shared";
import { member } from "./access";
import { familyService, decryptServiceKey } from "./ai";
import { originalLocation, readMedia, readStored } from "./storage";
import { json, noStore } from "./public-entries";

export const archiveFileName = (id: number, name: string) =>
  `${id}-${path.basename(name).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")}`;
type ArchiveFile = {
  name: string;
  path?: string;
  data?: Uint8Array;
  load?: () => Promise<Buffer>;
};
export async function createFamilyArchive(req: PayloadRequest) {
  const u = member(req);
  if (u?.role !== "parent") throw new APIError("仅家长可以导出家庭档案。", 403);
  const where = { familyId: { equals: u.familyId } },
    options = {
      pagination: false as const,
      limit: 0,
      depth: 0,
      overrideAccess: true,
      req,
    };
  const [entries, media, projects, spaces, history, versions, users] =
    await Promise.all([
      req.payload.find({ collection: "entries", where, ...options }),
      req.payload.find({ collection: "media", where, ...options }),
      req.payload.find({ collection: "projects", where, ...options }),
      req.payload.find({ collection: "spaces", where, ...options }),
      req.payload.find({ collection: "entry-history", where, ...options }),
      req.payload.findVersions({
        collection: "entries",
        where: { "version.familyId": { equals: u.familyId } },
        ...options,
      }),
      req.payload.find({ collection: "users", where, ...options }),
    ]);
  const settings = await familyService(req);
  const dataset = {
    format: "mylife-archive",
    version: 1,
    scope: "full-family",
    exportedAt: new Date().toISOString(),
    familyId: u.familyId,
    profile: spaces.docs[0] || null,
    entries: entries.docs,
    projects: projects.docs,
    history: history.docs,
    recentVersions: versions.docs,
    members: users.docs.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      allowPublicPublishing: m.allowPublicPublishing,
    })),
    settings: settings
      ? {
          enabled: settings.enabled,
          endpoint: settings.endpoint,
          model: settings.model,
          transcriptionModel: settings.transcriptionModel,
          consent: settings.consent,
          consentAt: settings.consentAt,
          preserveOriginals: settings.preserveOriginals,
          lastExportAt: settings.lastExportAt,
          apiKey: settings.keyCipher
            ? decryptServiceKey(settings.keyCipher, u.familyId)
            : null,
        }
      : null,
    media: media.docs.map((m) => ({
      ...m,
      id: m.id,
      filename: m.filename,
      mimeType: m.mimeType,
      filesize: m.filesize,
      alt: m.alt,
      owner: m.owner,
      processingStatus: m.processingStatus,
      preserveOriginal: m.preserveOriginal,
      archivePath: m.filename
        ? `media/${archiveFileName(m.id, m.filename)}`
        : null,
      originalPath: m.originalFilename
        ? `originals/${archiveFileName(m.id, m.originalFilename)}`
        : null,
      originalMimeType: m.originalMimeType,
      sha256: "",
      originalSha256: "",
    })),
  };
  const files: ArchiveFile[] = [
    {
      name: "archive.json",
      data: Buffer.from(JSON.stringify(dataset, null, 2)),
    },
    {
      name: "README.md",
      data: Buffer.from(
        "# MyLife 完整家庭备份\n\narchive.json 保存记录、项目、主页、成员、全部可用历史及家庭服务设置。media/ 与 originals/ 包含实际附件（从 COS 或旧本地存储读取），entries/ 为可读 Markdown。\n\n备份包含私密记录及已配置的 AI 服务密钥，请私密保管。不包含登录密码、COS 凭据或服务器环境变量。成员账号缺失时会创建随机密码账号，需要家长重新设置密码。\n\n后台设置页可预检并还原完整 ZIP；还原整体备份会替换当前家庭的资料与设置，保留现有登录账号。必须先通过文件完整性校验。missing-files.json 应为空；有缺失的包不可执行整体还原。旧版命令行增量恢复仍可使用。\n",
      ),
    },
  ];
  for (const e of entries.docs) {
    const ids = (e.media || []).map((m) => (typeof m === "number" ? m : m.id));
    const attachments = dataset.media.filter((m) => ids.includes(m.id));
    const markdown = `# ${entryTitle(e)}\n\n${e.occurredAt || e.dateNote || "时间待确认"} · ${e.type} · ${e.visibility}\n\n${e.content || ""}\n\n${e.reflection ? `## 当时的感受\n\n${e.reflection}\n\n` : ""}${e.learning ? `## 小小收获\n\n${e.learning}\n\n` : ""}## 最初的表达\n\n${e.originalText || "（最初以素材开始）"}\n\n${attachments.map((m) => (m.archivePath ? `- [${m.alt || m.filename}](../${encodeURI(m.archivePath)})` : "")).join("\n")}\n`;
    files.push({ name: `entries/${e.id}.md`, data: Buffer.from(markdown) });
  }
  for (const m of media.docs) {
    if (m.filename)
      files.push({
        name: `media/${archiveFileName(m.id, m.filename)}`,
        load: () => readMedia(m),
      });
    if (m.originalFilename)
      files.push({
        name: `originals/${archiveFileName(m.id, m.originalFilename)}`,
        load: () => {
          const original = originalLocation(m);
          return readStored(original.key, m.storage || "local", original.local);
        },
      });
  }
  // Check bytes before sending headers. The ZIP index carries hashes for restore preflight.
  for (const m of dataset.media) {
    if (m.archivePath)
      m.sha256 = await readMedia(m)
        .then((bytes) => createHash("sha256").update(bytes).digest("hex"))
        .catch(() => "");
    if (m.originalPath) {
      const location = originalLocation(m);
      m.originalSha256 = await readStored(
        location.key,
        m.storage || "local",
        location.local,
      )
        .then((bytes) => createHash("sha256").update(bytes).digest("hex"))
        .catch(() => "");
    }
  }
  files[0].data = Buffer.from(JSON.stringify(dataset, null, 2));
  return { dataset, files };
}
export function zipArchive(files: ArchiveFile[]) {
  let zip: Zip,
    cancelled = false,
    resume: (() => void) | undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      zip = new Zip((error, data, final) => {
        if (cancelled) return;
        if (error) {
          cancelled = true;
          controller.error(error);
          return;
        }
        if (data.length) controller.enqueue(data);
        if (final) controller.close();
      });
      const wait = async () => {
        if (
          !cancelled &&
          controller.desiredSize !== null &&
          controller.desiredSize <= 0
        )
          await new Promise<void>((resolve) => {
            resume = resolve;
          });
      };
      void (async () => {
        const missing: { file: string; reason: string }[] = [];
        for (const file of files) {
          if (cancelled) return;
          const item = new ZipPassThrough(file.name);
          zip.add(item);
          if (file.data || file.load) {
            const bytes =
              file.data ||
              (await file.load!().catch(() => {
                missing.push({
                  file: file.name,
                  reason: "导出时文件不可用，请检查旧文件或 COS 对象。",
                });
                return Buffer.alloc(0);
              }));
            for (let i = 0; i < bytes.length; i += 65536) {
              if (cancelled) return;
              item.push(bytes.subarray(i, i + 65536));
              await wait();
            }
          } else if (file.path) {
            try {
              for await (const chunk of createReadStream(file.path)) {
                if (cancelled) return;
                item.push(new Uint8Array(chunk as Buffer));
                await wait();
              }
            } catch {
              missing.push({
                file: file.name,
                reason:
                  "导出时文件不可用，请检查服务器素材目录或视频处理状态。",
              });
            }
          }
          item.push(new Uint8Array(), true);
          await wait();
        }
        if (cancelled) return;
        const report = new ZipPassThrough("missing-files.json");
        zip.add(report);
        report.push(Buffer.from(JSON.stringify(missing, null, 2)), true);
        zip.end();
      })().catch((error) => {
        if (!cancelled) {
          cancelled = true;
          controller.error(error);
        }
      });
    },
    pull() {
      const go = resume;
      resume = undefined;
      go?.();
    },
    cancel() {
      cancelled = true;
      resume?.();
      zip?.terminate();
    },
  });
}
export const archiveEndpoints: Endpoint[] = [
  {
    path: "/family/export",
    method: "get",
    handler: async (req) => {
      const u = member(req);
      if (u?.role !== "parent")
        return json({ error: "仅家长可以导出家庭档案。" }, 403);
      const { dataset, files } = await createFamilyArchive(req),
        settings = await familyService(req),
        data = { lastExportAt: new Date().toISOString() };
      if (settings)
        await req.payload.update({
          collection: "family-services",
          id: settings.id,
          data,
          overrideAccess: true,
          user: req.user,
          req,
        });
      else
        await req.payload.create({
          collection: "family-services",
          data: { familyId: u.familyId, ...data },
          overrideAccess: true,
          user: req.user,
          req,
        });
      const stamp = new Date().toISOString().slice(0, 10),
        format = new URL(
          req.url || "http://local/",
          "http://local",
        ).searchParams.get("format");
      if (format === "json")
        return new Response(JSON.stringify(dataset, null, 2), {
          headers: {
            ...noStore,
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="mylife-${stamp}.json"`,
          },
        });
      return new Response(zipArchive(files), {
        headers: {
          ...noStore,
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="mylife-${stamp}.zip"`,
        },
      });
    },
  },
];
