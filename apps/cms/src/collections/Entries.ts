import type { AccessResult, CollectionConfig } from "payload";
import { APIError } from "payload";
import { ENTRY_TYPES } from "@mylife/shared";
import { authenticated, editEntry, member, relationId } from "../lib/access";
import {
  normalizeDate,
  resolvePublication,
  validateEntry,
} from "../lib/entry-policy";
import { verifiedOriginal } from "../lib/ai-proof";

export const Entries: CollectionConfig = {
  slug: "entries",
  labels: { singular: "成长记录", plural: "成长记录" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "status", "visibility", "occurredAt"],
    group: "成长档案",
  },
  versions: { maxPerDoc: 100 },
  access: {
    create: authenticated,
    read: editEntry,
    update: editEntry,
    delete: () => false,
    readVersions: ({ req }): AccessResult => {
      const u = member(req);
      if (!u) return false;
      return u.role === "parent"
        ? { "version.familyId": { equals: u.familyId } }
        : {
            and: [
              { "version.familyId": { equals: u.familyId } },
              { "version.author": { equals: u.id } },
            ],
          };
    },
  },
  hooks: {
    beforeOperation: [
      ({ args, operation, req }) => {
        if (operation === "create" || operation === "update")
          req.context.entryIntent = {
            ...(args as { data?: Record<string, unknown> }).data,
          };
        return args;
      },
    ],
    beforeChange: [
      async ({ data, originalDoc, req, operation }) => {
        const u = member(req);
        if (!u) throw new APIError("请先登录。", 401);
        if (
          operation === "update" &&
          data.revision !== undefined &&
          data.revision !== originalDoc.revision
        )
          throw new APIError(
            "这条记录已有新版本。请重新打开后再保存，当前草稿仍在此设备。",
            409,
          );
        const merged = { ...originalDoc, ...data };
        validateEntry(merged);
        data.content = String(merged.content || "");
        const restoring =
          req.context.restoreArchive === true && u.role === "parent";
        data.createdAt =
          originalDoc?.createdAt ||
          (restoring &&
          data.createdAt &&
          Number.isFinite(Date.parse(data.createdAt))
            ? data.createdAt
            : new Date().toISOString());
        data.familyId = originalDoc?.familyId || u.familyId;
        data.author = originalDoc?.author
          ? relationId(originalDoc.author)
          : u.id;
        if (restoring && !originalDoc?.id && relationId(data.author)) {
          const author = await req.payload.find({
            collection: "users",
            where: {
              and: [
                {
                  id: {
                    equals: relationId(
                      (req.context.entryIntent as Record<string, unknown>)
                        ?.author,
                    ),
                  },
                },
                { familyId: { equals: u.familyId } },
              ],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            req,
          });
          if (author.docs[0]) data.author = author.docs[0].id;
        }
        data.editedBy = u.id;
        data.editorName = u.name;
        data.originalText =
          originalDoc?.originalText ?? String(data.content || "");
        if (
          restoring &&
          !originalDoc?.id &&
          typeof (req.context.entryIntent as Record<string, unknown>)
            ?.originalText === "string"
        )
          data.originalText = String(
            (req.context.entryIntent as Record<string, unknown>).originalText,
          ).slice(0, 50000);
        const originalToken = (
          req.context.entryIntent as Record<string, unknown> | undefined
        )?.aiOriginalToken;
        if (!originalDoc?.id && typeof originalToken === "string")
          data.originalText = verifiedOriginal(
            originalToken,
            u.id,
            u.familyId,
            String(data.clientId || ""),
          );
        data.revision =
          restoring &&
          !originalDoc?.id &&
          Number.isSafeInteger(data.revision) &&
          data.revision > 0
            ? data.revision
            : (originalDoc?.revision || 0) + 1;
        data.clientId = originalDoc?.clientId || data.clientId;
        data.occurredAt = normalizeDate(
          merged.occurredAt,
          merged.datePrecision,
        );
        const ids = (merged.media || []).map(relationId);
        const coverId = relationId(merged.coverMedia);
        if (coverId && !ids.includes(coverId))
          throw new APIError("封面需要从这条记录的附件中选择。", 400);
        if (coverId) {
          const cover = await req.payload.findByID({
            collection: "media",
            id: coverId,
            overrideAccess: false,
            user: req.user,
            req,
            depth: 0,
          });
          if (!cover.mimeType?.startsWith("image/"))
            throw new APIError("请选择照片作为封面。", 400);
        }
        const projectIds = [
          ...new Set(
            [
              ...(merged.projects || []).map(relationId),
              relationId(merged.mainProject),
            ].filter(Boolean),
          ),
        ];
        if (projectIds.length > 8)
          throw new APIError("每条记录最多关联 8 个成长项目。", 400);
        if (projectIds.length) {
          const projects = await req.payload.find({
            collection: "projects",
            where: {
              and: [
                { id: { in: projectIds } },
                { familyId: { equals: u.familyId } },
              ],
            },
            depth: 0,
            limit: 8,
            overrideAccess: false,
            user: req.user,
            req,
          });
          if (projects.docs.length !== projectIds.length)
            throw new APIError("部分成长项目不可访问，请重新选择。", 403);
        }
        data.projects = projectIds;
        data.mainProject = relationId(merged.mainProject) || null;
        data.coverMedia = coverId || null;
        if (ids.length) {
          const media = await req.payload.find({
            collection: "media",
            where: {
              and: [{ id: { in: ids } }, { familyId: { equals: u.familyId } }],
            },
            limit: 12,
            depth: 0,
            user: req.user,
            overrideAccess: false,
            req,
          });
          if (media.docs.length !== new Set(ids).size)
            throw new APIError("部分素材不可访问，请重新选择。", 403);
        }
        const intent = (req.context.entryIntent || data) as Record<
          string,
          unknown
        >;
        const wantsPublic =
          intent.visibility !== undefined
            ? intent.visibility === "public"
            : originalDoc?.visibility === "public";
        const publication = resolvePublication({
          requestedVisibility: wantsPublic ? "public" : "family",
          status: merged.status,
        });
        Object.assign(data, publication);
        const isApproved =
          publication.visibility === "public" &&
          publication.reviewStatus === "approved";
        // Publish only the fields intended for visitors; private metadata stays private.
        data.publicSnapshot = isApproved
          ? {
              id: originalDoc?.id,
              title: merged.title,
              type: merged.type,
              content: merged.content,
              reflection: merged.reflection,
              learning: merged.learning,
              occurredAt: data.occurredAt,
              datePrecision: merged.datePrecision,
              dateNote: merged.dateNote,
              retrospective: merged.retrospective,
              tags: merged.tags?.map((tag: { label: string }) => ({
                label: tag.label,
              })),
              media: ids,
              coverMedia: coverId || null,
              projects: projectIds,
              mainProject: data.mainProject,
              revision: data.revision,
            }
          : null;
        data.publicMedia = data.publicSnapshot?.media || [];
        return data;
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        const versionKey = `${doc.id}:${doc.revision}`;
        const existing = await req.payload.find({
          collection: "entry-history",
          where: { versionKey: { equals: versionKey } },
          depth: 0,
          limit: 1,
          overrideAccess: true,
          req,
        });
        if (!existing.docs.length)
          await req.payload.create({
            collection: "entry-history",
            data: {
              versionKey,
              entry: doc.id,
              revision: doc.revision,
              familyId: doc.familyId,
              author: relationId(doc.author),
              editorName: doc.editorName,
              snapshot: {
                ...doc,
                media: (doc.media || []).map(relationId),
                coverMedia: relationId(doc.coverMedia) || null,
                projects: (doc.projects || []).map(relationId),
                mainProject: relationId(doc.mainProject) || null,
              },
            },
            overrideAccess: true,
            req,
          });
        return doc;
      },
    ],
  },
  fields: [
    {
      name: "type",
      label: "记录方式",
      type: "select",
      required: true,
      defaultValue: "quick",
      options: ENTRY_TYPES.map((t) => ({ label: t.label, value: t.value })),
    },
    { name: "title", label: "标题", type: "text", maxLength: 160 },
    {
      name: "content",
      label: "记录正文",
      type: "textarea",
      defaultValue: "",
      maxLength: 50000,
    },
    {
      name: "reflection",
      label: "我的感受",
      type: "textarea",
      maxLength: 10000,
    },
    { name: "learning", label: "小小收获", type: "textarea", maxLength: 10000 },
    {
      name: "parentNote",
      label: "家长补充",
      type: "textarea",
      access: {
        create: ({ req }) => member(req)?.role === "parent",
        update: ({ req }) => member(req)?.role === "parent",
      },
    },
    {
      name: "originalText",
      label: "最初的表达",
      type: "textarea",
      admin: { readOnly: true },
    },
    { name: "occurredAt", label: "发生时间", type: "date", index: true },
    {
      name: "datePrecision",
      label: "时间精度",
      type: "select",
      required: true,
      defaultValue: "day",
      options: [
        { label: "具体日期", value: "day" },
        { label: "记得月份", value: "month" },
        { label: "记得年份", value: "year" },
        { label: "不确定", value: "unknown" },
      ],
    },
    { name: "dateNote", label: "关于时间的补充", type: "text", maxLength: 200 },
    {
      name: "retrospective",
      label: "这是一条回忆补录",
      type: "checkbox",
      defaultValue: false,
    },
    {
      name: "tags",
      label: "兴趣标签",
      type: "array",
      maxRows: 8,
      fields: [{ name: "label", type: "text", required: true, maxLength: 20 }],
    },
    {
      name: "media",
      label: "照片、视频与录音",
      type: "relationship",
      relationTo: "media",
      hasMany: true,
      maxRows: 12,
    },
    {
      name: "status",
      label: "保存状态",
      type: "select",
      defaultValue: "draft",
      required: true,
      options: [
        { label: "草稿", value: "draft" },
        { label: "已保存", value: "saved" },
        { label: "已归档", value: "archived" },
      ],
    },
    {
      name: "coverMedia",
      label: "记录封面",
      type: "relationship",
      relationTo: "media",
    },
    {
      name: "projects",
      label: "相关成长项目",
      type: "relationship",
      relationTo: "projects",
      hasMany: true,
      maxRows: 8,
    },
    {
      name: "mainProject",
      label: "主要成长项目",
      type: "relationship",
      relationTo: "projects",
    },
    {
      name: "visibility",
      label: "可见范围",
      type: "select",
      defaultValue: "family",
      required: true,
      options: [
        { label: "仅自己和家长可见", value: "family" },
        { label: "所有人可见（包括游客）", value: "public" },
      ],
    },
    {
      name: "publicRequested",
      label: "申请公开",
      type: "checkbox",
      defaultValue: false,
      admin: { hidden: true },
    },
    {
      name: "reviewStatus",
      label: "公开审核",
      type: "select",
      defaultValue: "none",
      admin: { hidden: true },
      options: [
        { label: "未申请", value: "none" },
        { label: "待家长确认", value: "pending" },
        { label: "批准公开", value: "approved" },
        { label: "不予公开", value: "rejected" },
      ],
      access: {
        create: ({ req }) => member(req)?.role === "parent",
        update: ({ req }) => member(req)?.role === "parent",
      },
    },
    {
      name: "familyId",
      type: "text",
      required: true,
      index: true,
      admin: { hidden: true },
    },
    {
      name: "author",
      label: "记录人",
      type: "relationship",
      relationTo: "users",
      required: true,
      admin: { readOnly: true },
    },
    {
      name: "editedBy",
      label: "最后修改人",
      type: "relationship",
      relationTo: "users",
      admin: { readOnly: true },
    },
    {
      name: "editorName",
      label: "修改人称呼快照",
      type: "text",
      admin: { readOnly: true },
    },
    {
      name: "clientId",
      type: "text",
      unique: true,
      required: true,
      admin: { hidden: true },
    },
    {
      name: "revision",
      type: "number",
      defaultValue: 1,
      admin: { hidden: true },
    },
    { name: "publicSnapshot", type: "json", admin: { hidden: true } },
    {
      name: "publicMedia",
      type: "relationship",
      relationTo: "media",
      hasMany: true,
      admin: { hidden: true },
    },
  ],
};
