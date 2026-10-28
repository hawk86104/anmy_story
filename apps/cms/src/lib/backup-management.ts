import path from "node:path";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { openSync, closeSync, writeSync, mkdirSync } from "node:fs";
import { Unzip, UnzipInflate } from "fflate";
import {
  addDataAndFileToRequest,
  APIError,
  createLocalReq,
  initTransaction,
  commitTransaction,
  killTransaction,
  type Endpoint,
  type PayloadRequest,
} from "payload";
import { member } from "./access";
import { json } from "./public-entries";
import { restoreFamilyArchive } from "./restore";
import {
  flushStorageDeletes,
  queueStorageDelete,
  localMediaPath,
  mediaKey,
  originalLocation,
} from "./storage";

const staging = path.resolve(process.env.BACKUP_TEMP_ROOT || "./.tmp/backups");
const lifetime = 30 * 60 * 1000;
const locks = new Set<string>();
function parent(req: PayloadRequest) {
  const user = member(req);
  if (user?.role !== "parent")
    throw new APIError("仅家长可以管理备份、还原或清空资料。", 403);
  return user;
}
function signature(id: string, req: PayloadRequest) {
  const u = parent(req);
  return createHmac("sha256", process.env.PAYLOAD_SECRET!)
    .update(`${id}:${u.familyId}:${u.id}`)
    .digest("hex");
}
function restorePath(token: string, req: PayloadRequest) {
  const [id, mac] = token.split(".");
  if (
    !/^restore-[a-zA-Z0-9-]+$/.test(id || "") ||
    !/^[a-f0-9]{64}$/.test(mac || "") ||
    !timingSafeEqual(Buffer.from(signature(id, req)), Buffer.from(mac))
  )
    throw new APIError("备份预检已失效，请重新选择文件。", 400);
  return path.join(staging, id);
}
export async function cleanupBackupTemps() {
  await mkdir(staging, { recursive: true });
  for (const name of await readdir(staging)) {
    if (!/^restore-[a-zA-Z0-9-]+$/.test(name)) continue;
    const target = path.resolve(staging, name);
    if (!target.startsWith(staging + path.sep))
      throw new Error("无效的备份临时目录。");
    const info = await stat(target);
    if (Date.now() - info.mtimeMs > lifetime)
      await rm(target, { recursive: true, force: true });
  }
}
export async function unpackBackup(bytes: Uint8Array, folder: string) {
  const { safeKey } = await import("./storage");
  const handles = new Set<number>(),
    names = new Set<string>();
  let total = 0,
    count = 0;
  const max =
    (Number(process.env.MAX_BACKUP_EXPANDED_MB) || 4096) * 1024 * 1024;
  const unzip = new Unzip((file) => {
    const name = file.name;
    safeKey(name.endsWith("/") ? name.slice(0, -1) : name);
    if (name.includes(":"))
      throw new APIError("备份包含不安全的文件路径。", 400);
    if (names.has(name) || ++count > 50000)
      throw new APIError("备份包含重复路径或文件数过多。", 400);
    names.add(name);
    if (name.endsWith("/")) return;
    const target = path.resolve(folder, name);
    if (!target.startsWith(path.resolve(folder) + path.sep))
      throw new APIError("备份文件超出目标目录。", 400);
    // Files are ordinary files created exclusively; archives cannot create links.
    mkdirSync(path.dirname(target), { recursive: true });
    const handle = openSync(target, "wx", 0o600);
    handles.add(handle);
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      total += chunk.length;
      size += chunk.length;
      if (
        total > max ||
        size > (name === "archive.json" ? 64 : 500) * 1024 * 1024
      )
        throw new APIError("备份解压大小超过限制。", 413);
      writeSync(handle, chunk);
      if (final) {
        closeSync(handle);
        handles.delete(handle);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    for (let offset = 0; offset < bytes.length; offset += 65536)
      unzip.push(
        bytes.subarray(offset, offset + 65536),
        offset + 65536 >= bytes.length,
      );
    if (handles.size || !names.has("archive.json"))
      throw new APIError("备份 ZIP 不完整。", 400);
    const missing = await readFile(
      path.join(folder, "missing-files.json"),
      "utf8",
    ).catch(() => "[]");
    if (!Array.isArray(JSON.parse(missing)) || JSON.parse(missing).length)
      throw new APIError("此备份包含缺失文件，不能整体还原。", 400);
  } finally {
    for (const handle of handles) closeSync(handle);
  }
}

export async function familyCounts(req: PayloadRequest) {
  const u = parent(req),
    where = { familyId: { equals: u.familyId } };
  const [entries, media, projects, history, jobs] = await Promise.all([
    req.payload.count({
      collection: "entries",
      where,
      overrideAccess: true,
      req,
    }),
    req.payload.count({
      collection: "media",
      where,
      overrideAccess: true,
      req,
    }),
    req.payload.count({
      collection: "projects",
      where,
      overrideAccess: true,
      req,
    }),
    req.payload.count({
      collection: "entry-history",
      where,
      overrideAccess: true,
      req,
    }),
    req.payload.count({
      collection: "storage-cleanup",
      where,
      overrideAccess: true,
      req,
    }),
  ]);
  const legacy = await req.payload.find({
    collection: "media",
    where: {
      and: [
        where,
        {
          or: [
            { storage: { equals: "local" } },
            { storage: { exists: false } },
          ],
        },
      ],
    },
    depth: 0,
    pagination: false,
    limit: 0,
    overrideAccess: true,
    req,
  });
  const unavailableMedia: { id: number; filename: string }[] = [];
  for (const doc of legacy.docs) {
    const main = doc.filename
      ? await stat(localMediaPath(mediaKey(doc))).catch(() => null)
      : null;
    const original = doc.originalFilename
      ? await stat(originalLocation(doc).local).catch(() => null)
      : true;
    if (!main || !original)
      unavailableMedia.push({
        id: doc.id,
        filename: doc.filename || `素材 #${doc.id}`,
      });
  }
  return {
    records: entries.totalDocs,
    media: media.totalDocs,
    projects: projects.totalDocs,
    history: history.totalDocs,
    pendingCleanup: jobs.totalDocs,
    unavailableMedia,
  };
}
export async function clearFamilyData(req: PayloadRequest, full = false) {
  const u = parent(req),
    where = { familyId: { equals: u.familyId } };
  const busy = await req.payload.count({
    collection: "media",
    where: {
      and: [where, { processingStatus: { in: ["queued", "processing"] } }],
    },
    overrideAccess: true,
    req,
  });
  if (busy.totalDocs)
    throw new APIError("还有视频排队或处理中，请处理完成后再清空或还原。", 409);
  const common = { where, overrideAccess: true as const, req };
  req.context.clearFamily = true;
  // Clear both live and historical relationships before deleting the media rows.
  await req.payload.delete({ collection: "entry-history", ...common });
  await req.payload.delete({ collection: "entries", ...common });
  await req.payload.delete({ collection: "projects", ...common });
  const spaces = await req.payload.find({
    collection: "spaces",
    ...common,
    depth: 0,
    pagination: false,
  });
  for (const space of spaces.docs) {
    if (full)
      await req.payload.delete({
        collection: "spaces",
        id: space.id,
        overrideAccess: true,
        req,
      });
    else
      await req.payload.update({
        collection: "spaces",
        id: space.id,
        data: { avatar: null, cover: null },
        overrideAccess: true,
        req,
      });
  }
  await req.payload.delete({ collection: "media", ...common });
  if (full)
    await req.payload.delete({ collection: "family-services", ...common });
}
async function locked(req: PayloadRequest, fn: () => Promise<Response>) {
  const u = parent(req);
  if (locks.has(u.familyId))
    throw new APIError("家庭资料正在处理中，请稍后重试。", 409);
  locks.add(u.familyId);
  try {
    return await fn();
  } finally {
    locks.delete(u.familyId);
  }
}
async function cleanupCommittedFiles(req: PayloadRequest, familyId: string) {
  try {
    return await flushStorageDeletes(req.payload, familyId);
  } catch {
    const count = await req.payload
      .count({
        collection: "storage-cleanup",
        where: { familyId: { equals: familyId } },
        overrideAccess: true,
      })
      .catch(() => ({ totalDocs: 1 }));
    return { removed: 0, pending: count.totalDocs || 1 };
  }
}
export const backupManagementEndpoints: Endpoint[] = [
  {
    path: "/family/data",
    method: "get",
    handler: async (req) => json(await familyCounts(req)),
  },
  {
    path: "/family/data/cleanup",
    method: "post",
    handler: async (req) => {
      const u = parent(req);
      return json(await flushStorageDeletes(req.payload, u.familyId));
    },
  },
  {
    path: "/family/data/clear",
    method: "post",
    handler: (req) =>
      locked(req, async () => {
        const u = parent(req);
        await addDataAndFileToRequest(req);
        if (req.data?.confirmation !== "清空所有历史记录以及素材")
          throw new APIError("请输入完整的清空确认文字。", 400);
        const tx = await createLocalReq(
          { user: req.user!, context: {} },
          req.payload,
        );
        await initTransaction(tx);
        try {
          await clearFamilyData(tx);
          await commitTransaction(tx);
        } catch (error) {
          await killTransaction(tx);
          throw error;
        }
        const cleanup = await cleanupCommittedFiles(req, u.familyId);
        return json({
          cleared: true,
          ...cleanup,
          ...(await familyCounts(req)),
        });
      }),
  },
  {
    path: "/family/restore/preview",
    method: "post",
    handler: (req) =>
      locked(req, async () => {
        const u = parent(req);
        await cleanupBackupTemps();
        await addDataAndFileToRequest(req);
        if (!req.file?.data?.length)
          throw new APIError("请选择完整备份 ZIP。", 400);
        const folder = await mkdtemp(path.join(staging, "restore-"));
        try {
          await unpackBackup(req.file.data, folder);
          const report = await restoreFamilyArchive(req.payload, {
            source: folder,
            familyId: u.familyId,
            full: true,
          });
          if (report.missingFiles.length)
            throw new APIError("备份缺少附件，不能整体还原。", 400);
          const id = path.basename(folder);
          return json({
            ...report,
            token: `${id}.${signature(id, req)}`,
            expiresAt: new Date(Date.now() + lifetime).toISOString(),
          });
        } catch (error) {
          await rm(folder, { recursive: true, force: true });
          throw error;
        }
      }),
  },
  {
    path: "/family/restore/apply",
    method: "post",
    handler: (req) =>
      locked(req, async () => {
        const u = parent(req);
        await addDataAndFileToRequest(req);
        if (req.data?.confirmation !== "还原整体备份")
          throw new APIError("请输入完整的还原确认文字。", 400);
        const folder = restorePath(String(req.data?.token || ""), req);
        const info = await stat(folder).catch(() => null);
        if (!info || Date.now() - info.mtimeMs > lifetime)
          throw new APIError("备份预检已过期，请重新选择文件。", 400);
        await restoreFamilyArchive(req.payload, {
          source: folder,
          familyId: u.familyId,
          full: true,
        });
        const tx = await createLocalReq(
          {
            user: req.user!,
            context: { trackUploads: true, uploadedObjects: [] },
          },
          req.payload,
        );
        await initTransaction(tx);
        let report: Awaited<ReturnType<typeof restoreFamilyArchive>>;
        try {
          await clearFamilyData(tx, true);
          report = await restoreFamilyArchive(req.payload, {
            source: folder,
            familyId: u.familyId,
            full: true,
            apply: true,
            req: tx,
          });
          await commitTransaction(tx);
        } catch (error) {
          await killTransaction(tx);
          const cleanupReq = await createLocalReq(
            { user: req.user! },
            req.payload,
          );
          for (const object of (tx.context.uploadedObjects || []) as {
            key: string;
            mode: string;
          }[])
            await queueStorageDelete(
              cleanupReq,
              u.familyId,
              object.key,
              object.mode,
            );
          await flushStorageDeletes(req.payload, u.familyId).catch(() => {});
          throw error;
        }
        const cleanup = await cleanupCommittedFiles(req, u.familyId);
        await rm(folder, { recursive: true, force: true }).catch(() => {});
        return json({ ...report, cleanup });
      }),
  },
];
