import "dotenv/config";
import path from "node:path";
import { readFile, unlink, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getPayload } from "payload";
import { closePayload } from "../lib/shutdown";
import {
  datePrefix,
  localMediaPath,
  mediaKey,
  originalLocation,
  putStored,
  readStored,
  storageMode,
} from "../lib/storage";

if (storageMode() !== "cos")
  throw new Error("请先配置 MEDIA_STORAGE=cos 及 COS 服务端环境变量。");
process.env.MYLIFE_MANAGED_SCHEMA = "true";
const { default: config } = await import("../payload.config");
const payload = await getPayload({ config });
const apply = process.argv.includes("--apply");
try {
  const files = await payload.find({
    collection: "media",
    pagination: false,
    limit: 0,
    depth: 0,
    overrideAccess: true,
  });
  let migrated = 0,
    pending = 0;
  const missing: { id: number; filename: string }[] = [];
  for (const file of files.docs) {
    if (file.storage === "cos" || !file.filename) continue;
    if (["queued", "processing"].includes(file.processingStatus || "")) {
      pending++;
      console.log(`素材 #${file.id} 正在排队或处理中，暂不迁移。`);
      continue;
    }
    const entry = await payload.find({
      collection: "entries",
      where: {
        and: [
          { familyId: { equals: file.familyId } },
          {
            or: [
              { media: { contains: file.id } },
              { publicMedia: { contains: file.id } },
            ],
          },
        ],
      },
      sort: "createdAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const createdAt = entry.docs[0]?.createdAt || file.createdAt;
    const prefix = datePrefix(createdAt);
    const local = localMediaPath(mediaKey(file));
    const bytes = await readFile(local).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (!bytes) {
      missing.push({ id: file.id, filename: file.filename });
      console.error(`素材 #${file.id} 的旧文件缺失，保留记录并跳过。`);
      continue;
    }
    const original = file.originalFilename ? originalLocation(file) : null;
    const originalBytes = original ? await readFile(original.local) : null;
    const key = `${prefix}/${file.filename}`;
    const originalKey = original
      ? `${prefix}/originals/${path.basename(file.originalFilename!)}`
      : null;
    if (!apply) {
      console.log(
        `待迁移 #${file.id} → ${prefix}/（${bytes.length} bytes${originalBytes ? "，含原件" : ""}）`,
      );
      continue;
    }
    await putStored(
      key,
      bytes,
      file.mimeType || "application/octet-stream",
      "cos",
    );
    if (originalBytes && originalKey)
      await putStored(
        originalKey,
        originalBytes,
        file.originalMimeType || "application/octet-stream",
        "cos",
      );
    // Verify the downloaded bytes, then commit the location before deleting local copies.
    for (const [objectKey, expected] of [
      [key, bytes],
      ...(originalBytes && originalKey ? [[originalKey, originalBytes]] : []),
    ] as [string, Buffer][]) {
      const downloaded = await readStored(objectKey, "cos");
      if (
        !createHash("sha256")
          .update(downloaded)
          .digest()
          .equals(createHash("sha256").update(expected).digest())
      )
        throw new Error(`素材 #${file.id} 云端读回校验失败，保留本地文件。`);
    }
    await payload.update({
      collection: "media",
      id: file.id,
      data: { storage: "cos", prefix, originalFilename: originalKey },
      overrideAccess: true,
      context: {
        mediaWorker: true,
        mediaMigration: true,
        recordCreatedAt: createdAt,
      },
    });
    await unlink(local);
    if (original) await unlink(original.local);
    migrated++;
    console.log(`已迁移并清理本地副本 #${file.id} → ${prefix}/`);
  }
  const report = { apply, total: files.totalDocs, migrated, pending, missing };
  if (apply) {
    const reportPath = path.resolve(
      process.env.MEDIA_MIGRATION_REPORT ||
        "./data/media-migration-report.json",
    );
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report));
  if (missing.length) process.exitCode = 1;
} finally {
  await closePayload(payload);
}
