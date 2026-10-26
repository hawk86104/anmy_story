import path from "node:path";
import sharp from "sharp";
import type { AccessResult, CollectionConfig, Where } from "payload";
import { APIError } from "payload";
import { authenticated, member, relationId } from "../lib/access";
import { publicEntryWhere } from "../lib/public-entries";

export const mediaRoot = path.resolve(process.env.MEDIA_ROOT || "./media");
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
        if (["queued", "processing"].includes(media.processingStatus || ""))
          throw new APIError(
            "视频正在排队或处理中，请等处理完成后再删除。",
            409,
          );
        const linked = await req.payload.find({
          collection: "entries",
          where: {
            or: [{ media: { in: [id] } }, { publicMedia: { in: [id] } }],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        });
        if (linked.docs.length)
          throw new APIError(
            "这份素材仍被成长记录使用，请先从记录中移除后再删除。",
            409,
          );
      },
    ],
    beforeOperation: [
      async ({ args, operation, req }) => {
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
  },
  endpoints: [
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
