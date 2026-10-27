import path from "node:path";
import sharp from "sharp";
import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { AccessResult, CollectionConfig, Where } from "payload";
import { APIError } from "payload";
import { authenticated, member, relationId } from "../lib/access";
import { publicEntryWhere } from "../lib/public-entries";
import { mediaReferences, publicDecorativeMedia } from "../lib/media-links";

export const mediaRoot = path.resolve(process.env.MEDIA_ROOT || "./media");
export const originalsRoot = path.resolve(
  process.env.ORIGINALS_ROOT || `${mediaRoot}-originals`,
);
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
        if (media.originalFilename)
          req.context.deletedOriginals = {
            ...((req.context.deletedOriginals || {}) as Record<string, string>),
            [String(id)]: media.originalFilename,
          };
        if (["queued", "processing"].includes(media.processingStatus || ""))
          throw new APIError(
            "视频正在排队或处理中，请等处理完成后再删除。",
            409,
          );
        if (await mediaReferences(Number(id), req))
          throw new APIError(
            "这份素材仍被成长记录使用，或用于个人主页、项目，请先移除关联后再删除。",
            409,
          );
      },
    ],
    beforeOperation: [
      async ({ args, operation, req }) => {
        if (
          operation === "create" &&
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
      ({ data, req, originalDoc, context, operation }) => {
        const u = member(req);
        if (!u && !context.mediaWorker) throw new APIError("请先登录。", 401);
        data.familyId = originalDoc?.familyId || u?.familyId;
        data.owner = originalDoc?.owner || u?.id;
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
          data.processingStatus =
            originalDoc?.processingStatus ||
            (req.file?.mimetype.startsWith("video/") ? "queued" : "ready");
          if (operation === "update" && req.file)
            throw new APIError(
              "已关联素材不能被直接替换，请上传新素材后修改记录。",
              400,
            );
        }
        return data;
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        const original = req.context.originalUpload as
          { data: Buffer; name: string; mimeType: string } | undefined;
        if (operation === "create" && original) {
          const filename = `${doc.id}-${randomUUID()}${path.extname(path.basename(original.name)).toLowerCase()}`;
          await mkdir(originalsRoot, { recursive: true });
          await writeFile(path.join(originalsRoot, filename), original.data, {
            flag: "wx",
            mode: 0o600,
          });
          const updated = await req.payload.update({
            collection: "media",
            id: doc.id,
            data: {
              originalFilename: filename,
              originalMimeType: original.mimeType,
              preserveOriginal: true,
            },
            overrideAccess: true,
            context: { mediaWorker: true },
            req,
          });
          return updated;
        }
        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const filename =
          (
            req.context.deletedOriginals as Record<string, string> | undefined
          )?.[String(doc.id)] || doc.originalFilename;
        if (filename)
          await unlink(path.join(originalsRoot, path.basename(filename))).catch(
            (e: NodeJS.ErrnoException) => {
              if (e.code !== "ENOENT") throw e;
            },
          );
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
        const file = path.join(
          originalsRoot,
          path.basename(m.originalFilename),
        );
        const info = await stat(file).catch(() => null);
        if (!info)
          return Response.json({ error: "原件暂时不可用。" }, { status: 404 });
        return new Response(
          Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
          {
            headers: {
              "Content-Type": m.originalMimeType || "application/octet-stream",
              "Content-Length": String(info.size),
              "Content-Disposition": `attachment; filename="original-${m.id}${path.extname(m.originalFilename)}"`,
              "Cache-Control": "no-store",
            },
          },
        );
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
