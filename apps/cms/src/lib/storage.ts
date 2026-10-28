import path from "node:path";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import COS from "cos-nodejs-sdk-v5";
import { APIError, type Payload, type PayloadRequest } from "payload";

export const mediaRoot = path.resolve(process.env.MEDIA_ROOT || "./media");
export const originalsRoot = path.resolve(
  process.env.ORIGINALS_ROOT || `${mediaRoot}-originals`,
);
export type StoredMedia = {
  filename?: string | null;
  prefix?: string | null;
  storage?: string | null;
  originalFilename?: string | null;
};
export const storageMode = () => {
  if (process.env.MEDIA_STORAGE === "local") return "local";
  if (!process.env.MEDIA_STORAGE || process.env.MEDIA_STORAGE === "cos")
    return "cos";
  throw new APIError("MEDIA_STORAGE 仅支持 cos 或 local。", 503);
};
let client: COS | undefined;
export function cosClient() {
  if (
    !process.env.COS_SECRET_ID ||
    !process.env.COS_SECRET_KEY ||
    !process.env.COS_BUCKET ||
    !process.env.COS_REGION
  )
    throw new APIError("COS 配置不完整，请检查服务端环境变量。", 503);
  return (client ||= new COS({
    SecretId: process.env.COS_SECRET_ID,
    SecretKey: process.env.COS_SECRET_KEY,
    Protocol: "https:",
    Domain: process.env.COS_DOMAIN,
    ForceSignHost: true,
    Timeout: 120000,
  }));
}
const bucket = () => ({
  Bucket: process.env.COS_BUCKET!,
  Region: process.env.COS_REGION!,
});
export function safeKey(value: string) {
  if (
    !value ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.split("/").some((p) => !p || p === "." || p === "..") ||
    /[\x00-\x1f]/.test(value)
  )
    throw new APIError("无效的素材路径。", 400);
  return value;
}
export function datePrefix(value: unknown = new Date().toISOString()) {
  const date = new Date(typeof value === "string" ? value : Date.now());
  if (!Number.isFinite(date.getTime()))
    throw new APIError("无效的记录创建日期。", 400);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return `media/${parts}`;
}
export function mediaKey(doc: StoredMedia, filename = doc.filename) {
  if (!filename || path.basename(filename) !== filename)
    throw new APIError("无效的素材文件名。", 400);
  return safeKey(doc.prefix ? `${doc.prefix}/${filename}` : filename);
}
export function localMediaPath(key: string) {
  safeKey(key);
  return path.join(mediaRoot, key.startsWith("media/") ? key.slice(6) : key);
}
export function originalLocation(doc: StoredMedia) {
  if (!doc.originalFilename) throw new APIError("这份素材没有保留原件。", 404);
  return doc.originalFilename.includes("/")
    ? {
        key: safeKey(doc.originalFilename),
        local: localMediaPath(doc.originalFilename),
      }
    : {
        key: safeKey(doc.originalFilename),
        local: path.join(originalsRoot, doc.originalFilename),
      };
}
export async function putStored(
  key: string,
  bytes: Buffer,
  mime: string,
  mode = storageMode(),
) {
  safeKey(key);
  if (mode === "local") {
    const file = localMediaPath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { mode: 0o600 });
    return;
  }
  const cos = cosClient();
  const digest = createHash("md5").update(bytes).digest();
  await cos.putObject({
    ...bucket(),
    Key: key,
    Body: bytes,
    ContentLength: bytes.length,
    ContentType: mime,
    Headers: {
      "Content-MD5": digest.toString("base64"),
      "x-cos-meta-sha256": createHash("sha256").update(bytes).digest("hex"),
    },
    ACL: "private",
    CacheControl: "private, no-store",
  });
  const head = await cos.headObject({ ...bucket(), Key: key });
  if (
    Number(head.headers?.["content-length"]) !== bytes.length ||
    String(head.ETag || head.headers?.etag).replaceAll('"', "") !==
      digest.toString("hex")
  )
    throw new APIError("COS 上传校验未通过，未清理本地文件。", 502);
}
export async function readStored(
  key: string,
  mode: string,
  local = localMediaPath(key),
): Promise<Buffer> {
  safeKey(key);
  if (mode !== "cos") return readFile(local);
  const data = await cosClient().getObject({ ...bucket(), Key: key });
  return Buffer.isBuffer(data.Body)
    ? data.Body
    : Buffer.from(data.Body as string);
}
export const readMedia = (doc: StoredMedia) =>
  readStored(mediaKey(doc), doc.storage || "local");
export function signedMediaURL(key: string, cdn = true) {
  const url = new URL(
    cosClient().getObjectUrl({
      ...bucket(),
      Key: safeKey(key),
      Sign: true,
      Expires: 3600,
      Protocol: "https:",
    }),
  );
  // The CDN forwards the signed query to the COS origin, whose Host is signed.
  if (cdn && process.env.COS_CDN_ORIGIN)
    url.host = new URL(process.env.COS_CDN_ORIGIN).host;
  return url.toString();
}
export async function removeStored(
  key: string,
  mode: string,
  original = false,
) {
  safeKey(key);
  if (mode === "cos") await cosClient().deleteObject({ ...bucket(), Key: key });
  else
    await unlink(
      original && !key.includes("/")
        ? path.join(originalsRoot, key)
        : localMediaPath(key),
    ).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") throw e;
    });
}
export async function queueStorageDelete(
  req: PayloadRequest,
  familyId: string,
  key: string,
  mode: string,
  original = false,
) {
  await req.payload.create({
    collection: "storage-cleanup",
    data: {
      familyId,
      objectKey: safeKey(key),
      storage: mode === "cos" ? "cos" : "local",
      original,
    },
    overrideAccess: true,
    req,
  });
}
export async function flushStorageDeletes(payload: Payload, familyId?: string) {
  const jobs = await payload.find({
    collection: "storage-cleanup",
    ...(familyId ? { where: { familyId: { equals: familyId } } } : {}),
    pagination: false,
    limit: 0,
    depth: 0,
    overrideAccess: true,
  });
  let removed = 0;
  for (const job of jobs.docs) {
    try {
      await removeStored(job.objectKey, job.storage, !!job.original);
      await payload.delete({
        collection: "storage-cleanup",
        id: job.id,
        overrideAccess: true,
      });
      removed++;
    } catch {
      // The durable outbox is retried by the media worker and the management screen.
    }
  }
  return { removed, pending: jobs.docs.length - removed };
}
