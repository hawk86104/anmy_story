import path from "node:path";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import type { AccessResult, CollectionConfig, Where } from "payload";
import { APIError } from "payload";
import { authenticated, member, relationId } from "../lib/access";
import { publicEntryWhere } from "../lib/public-entries";
import { mediaReferences, publicDecorativeMedia } from "../lib/media-links";
import {
  datePrefix,
  mediaRoot,
  originalsRoot,
  mediaKey,
  originalLocation,
  putStored,
  queueStorageDelete,
  readStored,
  signedMediaURL,
  storageMode,
} from "../lib/storage";

export { mediaRoot, originalsRoot };
export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "素材", plural: "素材库" },
  admin: {
    useAsTitle: "filename",
    defaultColumns: ["filename", "mimeType", "filesize", "processingStatus"],
    group: "成长档案",
    description: "家长可删除未被记录使用的素材；已关联素材需先从记录中移除。",
  },
  access: {
    create: authenticated,
    delete: ({ req }) => {
      const u = member(req);
      return u?.role === "parent"
        ? { familyId: { equals: u.familyId } }
        : false;
    },
    update: ({ req }): AccessResult => {
      const u = member(req);
      if (!u) return false;
      return u.role === "parent"
        ? { familyId: { equals: u.familyId } }
        : {
            and: [
              { familyId: { equals: u.familyId } },
              { owner: { equals: u.id } },
            ],
          };
    },
    read: async ({ req }): Promise<AccessResult> => {
      const u = member(req);
      const publicDocs = await req.payload.find({
        collection: "entries",
        where:
          u?.role === "child"
            ? {
                or: [
                  publicEntryWhere,
                  {
                    and: [
                      { familyId: { equals: u.familyId } },
                      { author: { equals: u.id } },
                    ],
                  },
                ],
              }
            : publicEntryWhere,
        pagination: false,
        limit: 0,
        depth: 0,
        overrideAccess: true,
        req,
      });
      const ids = publicDocs.docs.flatMap((d) =>
        u?.role === "child" &&
        d.familyId === u.familyId &&
        relationId(d.author) === u.id
          ? (d.media || []).map(relationId)
          : (d.publicMedia || []).map(relationId),
      );
      ids.push(...(await publicDecorativeMedia(req)));
      if (u?.role === "child") {
        const projects = await req.payload.find({
          collection: "projects",
          where: {
            and: [
              { familyId: { equals: u.familyId } },
              { owner: { equals: u.id } },
            ],
          },
          depth: 0,
          pagination: false,
          limit: 0,
          overrideAccess: true,
          req,
        });
        ids.push(
          ...projects.docs.map((p) => relationId(p.cover)).filter(Boolean),
        );
      }
      const permissions: Where[] = ids.length ? [{ id: { in: ids } }] : [];
      if (u)
        permissions.push(
          u.role === "parent"
            ? { familyId: { equals: u.familyId } }
            : {
                and: [
                  { familyId: { equals: u.familyId } },
                  { owner: { equals: u.id } },
                ],
              },
        );
      return permissions.length ? { or: permissions } : false;
    },
  },
  upload: {
    staticDir: mediaRoot,
    mimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "audio/mpeg",
      "audio/mp4",
      "audio/x-m4a",
      "audio/wav",
      "audio/webm",
      "audio/ogg",
      "application/pdf",
    ],
  },
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        const media = await req.payload.findByID({
          collection: "media",
          id,
          depth: 0,
          overrideAccess: true,
          req,
        });
        const clearing =
          req.context.clearFamily === true && member(req)?.role === "parent";
        if (["queued", "processing"].includes(media.processingStatus || ""))
          throw new APIError(
            "视频正在排队或处理中，请等处理完成后再删除。",
            409,
          );
        if (!clearing && (await mediaReferences(Number(id), req)))
          throw new APIError(
            "这份素材仍被成长记录使用，或用于个人主页、项目，请先移除关联后再删除。",
            409,
          );
        if (media.filename)
          await queueStorageDelete(
            req,
            media.familyId,
            mediaKey(media),
            media.storage || "local",
          );
        if (media.originalFilename)
          await queueStorageDelete(
            req,
            media.familyId,
            media.originalFilename,
            media.storage || "local",
            true,
          );
        ((req.context.deletedMediaIds ||= []) as string[]).push(String(id));
      },
    ],
    beforeOperation: [
      async ({ args, operation, req }) => {
        if (
          req.file &&
          req.file.size >
            Math.min(500, Number(process.env.MAX_UPLOAD_MB) || 100) *
              1024 *
              1024
        )
          throw new APIError("文件超过上传上限，请选择更小的文件。", 413);
        if ((operation === "create" || operation === "update") && req.file) {
          delete req.context._payloadCloudStorage;
          delete req.context.originalUpload;
          req.file.name = `${randomUUID()}${path.extname(path.basename(req.file.name)).toLowerCase()}`;
        }
        if (req.context.restoredOriginal)
          req.context.originalUpload = req.context.restoredOriginal;
        if (
          operation === "create" &&
          !req.context.restoreArchive &&
          req.file &&
          /^(image|video)\//.test(req.file.mimetype) &&
          member(req)
        ) {
          const services = await req.payload.find({
            collection: "family-services",
            where: { familyId: { equals: member(req)!.familyId } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            req,
          });
          if (
            services.docs[0]?.preserveOriginals ||
            req.context.restoreOriginal === true
          )
            req.context.originalUpload = {
              data: req.file.data,
              name: req.file.name,
              mimeType: req.file.mimetype,
            };
        }
        if (
          (operation === "create" || operation === "update") &&
          !req.context.restoreArchive &&
          req.file &&
          /^image\/(jpeg|png|webp)$/.test(req.file.mimetype)
        ) {
          const originalSize = req.file.size;
          try {
            const isDocument = req.data?.imageKind === "document";
            const buffer = await sharp(req.file.data, {
              limitInputPixels: 80000000,
            })
              .rotate()
              .resize(isDocument ? 4096 : 2048, isDocument ? 4096 : 2048, {
                fit: "inside",
                withoutEnlargement: true,
              })
              .webp({ quality: isDocument ? 92 : 82 })
              .toBuffer();
            req.file = {
              ...req.file,
              data: buffer,
              size: buffer.length,
              mimetype: "image/webp",
              name: `${path.parse(req.file.name).name}.webp`,
            };
            if (req.data)
              req.data.originalSize =
                Number(req.data.originalSize) || originalSize;
          } catch {
            throw new APIError(
              "这张图片暂时无法处理，请换一张 JPEG、PNG 或 WebP 图片。",
              400,
            );
          }
        }
        return args;
      },
    ],
    beforeChange: [
      async ({ data, req, originalDoc, context, operation }) => {
        const u = member(req);
        if (!u && !context.mediaWorker) throw new APIError("请先登录。", 401);
        data.familyId = originalDoc?.familyId || u?.familyId;
        data.owner = originalDoc?.owner || u?.id;
        if (originalDoc && !req.file) {
          for (const field of [
            "filename",
            "mimeType",
            "filesize",
            "width",
            "height",
            "sizes",
            "focalX",
            "focalY",
            "createdAt",
          ])
            data[field] = originalDoc[field];
        }
        if (context.restoreArchive && u?.role === "parent")
          data.owner = context.restoreMediaOwner || data.owner;
        data.prefix =
          originalDoc?.prefix ||
          (req.file
            ? datePrefix(
                req.data?.recordCreatedAt ||
                  data.createdAt ||
                  new Date().toISOString(),
              )
            : "");
        if (
          !originalDoc?.id &&
          context.restoreArchive &&
          u?.role === "parent" &&
          typeof context.restoreMediaPrefix === "string" &&
          /^media\/\d{4}-\d{2}-\d{2}$/.test(context.restoreMediaPrefix)
        )
          data.prefix = context.restoreMediaPrefix;
        data.storage = req.file
          ? storageMode()
          : originalDoc?.storage || "local";
        if (context.mediaMigration) {
          data.prefix = datePrefix(context.recordCreatedAt);
          data.storage = "cos";
        }
        // Storage coordinates are server-owned, including the plugin's optional object key.
        data._objectKey = originalDoc?._objectKey || null;
        if (context.mediaMigration) {
          if (
            typeof context.mediaMigrationObjectKey !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              context.mediaMigrationObjectKey,
            )
          )
            throw new APIError("无效的素材迁移目录。", 400);
          data._objectKey = context.mediaMigrationObjectKey;
        }
        data.originalSize =
          originalDoc?.originalSize ||
          Number(data.originalSize) ||
          req.file?.size;
        data.preserveOriginal = !!(
          originalDoc?.preserveOriginal || req.context.originalUpload
        );
        if (!context.mediaWorker) {
          data.originalFilename = originalDoc?.originalFilename || null;
          data.originalMimeType = originalDoc?.originalMimeType || null;
        }
        if (!context.mediaWorker) {
          data.processingError = originalDoc?.processingError || null;
          if (context.restoreArchive && u?.role === "parent")
            data.processingError = context.restoredMediaError || null;
          data.processingStatus =
            originalDoc?.processingStatus ||
            (context.restoreArchive
              ? context.restoredMediaStatus || "ready"
              : req.file?.mimetype.startsWith("video/")
                ? "queued"
                : "ready");
          if (operation === "update" && req.file)
            throw new APIError(
              "已关联素材不能被直接替换，请上传新素材后修改记录。",
              400,
            );
        }
        const original = req.context.originalUpload as
          { data: Buffer; name: string; mimeType: string } | undefined;
        if (operation === "create" && original) {
          const key = `${data.prefix}/originals/${randomUUID()}${path.extname(path.basename(original.name)).toLowerCase()}`;
          await putStored(key, original.data, original.mimeType);
          data.originalFilename = key;
          data.originalMimeType = original.mimeType;
          data.preserveOriginal = true;
          if (req.context.trackUploads)
            (
              (req.context.uploadedObjects ||= []) as {
                key: string;
                mode: string;
              }[]
            ).push({ key, mode: storageMode() });
        }
        return data;
      },
    ],
    afterRead: [
      ({ doc }) => {
        if (doc.storage === "cos" && doc.filename)
          doc.url = signedMediaURL(mediaKey(doc));
        return doc;
      },
    ],
  },
  endpoints: [
    {
      path: "/:id/original",
      method: "get",
      handler: async (req) => {
        const u = member(req);
        if (u?.role !== "parent")
          return Response.json(
            { error: "仅家长可以下载保留的原件。" },
            { status: 403 },
          );
        const id = Number(req.routeParams?.id);
        if (!Number.isSafeInteger(id) || id < 1)
          return Response.json({ error: "无效的素材。" }, { status: 400 });
        const docs = await req.payload.find({
          collection: "media",
          where: {
            and: [{ id: { equals: id } }, { familyId: { equals: u.familyId } }],
          },
          depth: 0,
          limit: 1,
          overrideAccess: true,
          req,
        });
        const m = docs.docs[0];
        if (!m?.originalFilename)
          return Response.json(
            { error: "这份素材没有另存的上传原件。" },
            { status: 404 },
          );
        const location = originalLocation(m);
        const bytes = await readStored(
          location.key,
          m.storage || "local",
          location.local,
        ).catch(() => null);
        if (!bytes)
          return Response.json({ error: "原件暂时不可用。" }, { status: 404 });
        return new Response(new Uint8Array(bytes), {
          headers: {
            "Content-Type": m.originalMimeType || "application/octet-stream",
            "Content-Length": String(bytes.length),
            "Content-Disposition": `attachment; filename="original-${m.id}${path.extname(m.originalFilename)}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
    {
      path: "/:id/retry",
      method: "post",
      handler: async (req) => {
        const u = member(req);
        if (!u) return Response.json({ error: "请先登录。" }, { status: 401 });
        const doc = await req.payload.findByID({
          collection: "media",
          id: String(req.routeParams?.id),
          user: req.user,
          overrideAccess: false,
          req,
          depth: 0,
        });
        if (doc.processingStatus !== "failed")
          return Response.json(
            { error: "这份素材无需重试。" },
            { status: 400 },
          );
        const updated = await req.payload.update({
          collection: "media",
          id: doc.id,
          data: { processingStatus: "queued", processingError: null },
          overrideAccess: true,
          context: { mediaWorker: true },
          req,
        });
        return Response.json(updated);
      },
    },
  ],
  fields: [
    {
      name: "storage",
      type: "select",
      options: ["local", "cos"],
      admin: { readOnly: true },
      defaultValue: "local",
    },
    {
      name: "prefix",
      label: "素材日期目录",
      type: "text",
      admin: { readOnly: true },
    },
    { name: "alt", label: "素材说明", type: "text", maxLength: 300 },
    {
      name: "preserveOriginal",
      label: "已保留上传原件",
      type: "checkbox",
      defaultValue: false,
      admin: { readOnly: true },
    },
    {
      name: "originalFilename",
      type: "text",
      admin: { hidden: true },
      access: { read: () => false, create: () => false, update: () => false },
    },
    {
      name: "originalMimeType",
      type: "text",
      admin: { hidden: true },
      access: { read: () => false, create: () => false, update: () => false },
    },
    {
      name: "imageKind",
      label: "图片用途",
      type: "select",
      defaultValue: "photo",
      options: [
        { label: "生活照片", value: "photo" },
        { label: "证书或文字图片", value: "document" },
      ],
    },
    {
      name: "familyId",
      type: "text",
      required: true,
      index: true,
      admin: { hidden: true },
    },
    {
      name: "owner",
      type: "relationship",
      relationTo: "users",
      admin: { readOnly: true },
    },
    {
      name: "originalSize",
      label: "上传前大小",
      type: "number",
      admin: { readOnly: true },
    },
    {
      name: "processingStatus",
      label: "处理状态",
      type: "select",
      defaultValue: "ready",
      index: true,
      options: ["ready", "queued", "processing", "failed"],
      admin: { readOnly: true },
    },
    {
      name: "processingError",
      label: "处理提示",
      type: "text",
      admin: { readOnly: true },
    },
  ],
};
