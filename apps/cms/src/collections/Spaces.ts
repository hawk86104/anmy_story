import type { AccessResult, CollectionConfig } from "payload";
import { APIError } from "payload";
import {
  DEFAULT_ENTRY_TAGS,
  MAX_ENTRY_TAG_OPTIONS,
  THEMES,
} from "@mylife/shared";
import { authenticated, familyOnly, member, relationId } from "../lib/access";

export const Spaces: CollectionConfig = {
  slug: "spaces",
  labels: { singular: "成长主页", plural: "成长主页" },
  admin: { useAsTitle: "displayName", group: "家庭与权限" },
  access: {
    create: authenticated,
    read: familyOnly,
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
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, originalDoc }) => {
        const u = member(req);
        const restoredOwner = relationId(data.owner);
        if (!u) throw new APIError("请先登录。", 401);
        data.familyId = originalDoc?.familyId || u.familyId;
        data.owner = originalDoc?.owner ? relationId(originalDoc.owner) : u.id;
        if (!originalDoc?.id && u.role === "parent") {
          const children = await req.payload.find({
            collection: "users",
            where: {
              and: [
                { familyId: { equals: u.familyId } },
                { role: { equals: "child" } },
              ],
            },
            sort: "createdAt",
            depth: 0,
            limit: 1,
            overrideAccess: true,
            req,
          });
          data.owner = children.docs[0]?.id || u.id;
        }
        if (
          req.context.restoreArchive &&
          u.role === "parent" &&
          !originalDoc?.id &&
          restoredOwner
        ) {
          const owner = await req.payload.find({
            collection: "users",
            where: {
              and: [
                { id: { equals: restoredOwner } },
                { familyId: { equals: u.familyId } },
              ],
            },
            depth: 0,
            limit: 1,
            overrideAccess: true,
            req,
          });
          if (owner.docs[0]) data.owner = owner.docs[0].id;
        }
        const ids = [
          relationId(data.avatar ?? originalDoc?.avatar),
          relationId(data.cover ?? originalDoc?.cover),
        ].filter(Boolean);
        if (ids.length) {
          const files = await req.payload.find({
            collection: "media",
            where: {
              and: [
                { id: { in: ids } },
                { familyId: { equals: u.familyId } },
                { mimeType: { like: "image/" } },
              ],
            },
            limit: 2,
            depth: 0,
            overrideAccess: false,
            user: req.user,
            req,
          });
          if (files.docs.length !== new Set(ids).size)
            throw new APIError("请选择本家庭可访问的照片作为头像或封面。", 403);
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "familyId",
      type: "text",
      required: true,
      unique: true,
      admin: { hidden: true },
    },
    {
      name: "owner",
      type: "relationship",
      relationTo: "users",
      required: true,
      admin: { readOnly: true },
    },
    {
      name: "displayName",
      label: "公开称呼",
      type: "text",
      defaultValue: "我的成长手记",
      required: true,
      maxLength: 40,
    },
    {
      name: "bio",
      label: "公开简介",
      type: "textarea",
      defaultValue: "关于探索、创造，和每一个小小的进步。",
      maxLength: 300,
    },
    {
      name: "interests",
      label: "公开兴趣标签",
      type: "array",
      maxRows: 6,
      fields: [{ name: "label", type: "text", required: true, maxLength: 16 }],
    },
    {
      name: "entryTagOptions",
      label: "记录常用标签",
      type: "json",
      defaultValue: [...DEFAULT_ENTRY_TAGS],
      admin: {
        description:
          "记录编辑器中的常用标签。也可以在手机家长后台的标签管理中维护；移除选项不会删除旧记录上的标签。",
      },
      access: {
        create: ({ req }) => member(req)?.role === "parent",
        update: ({ req }) => member(req)?.role === "parent",
      },
      validate: (value) => {
        if (!Array.isArray(value) || value.length > MAX_ENTRY_TAG_OPTIONS)
          return `请填写标签数组，最多 ${MAX_ENTRY_TAG_OPTIONS} 个。`;
        if (
          value.some(
            (label) =>
              typeof label !== "string" ||
              !label.trim() ||
              label !== label.trim() ||
              label.length > 20,
          )
        )
          return "每个标签需为 1 至 20 个字，前后不能有空格。";
        if (
          new Set(value.map((label) => label.toLocaleLowerCase())).size !==
          value.length
        )
          return "常用标签不能重复。";
        return true;
      },
    },
    {
      name: "avatar",
      label: "公开头像",
      type: "relationship",
      relationTo: "media",
      admin: { description: "选择后，游客可以查看这张头像。" },
    },
    {
      name: "cover",
      label: "公开封面",
      type: "relationship",
      relationTo: "media",
      admin: { description: "留空使用主题插画；选择的照片会公开。" },
    },
    {
      name: "theme",
      label: "主页主题",
      type: "select",
      defaultValue: "usagi",
      required: true,
      options: THEMES.map((t) => ({ label: t.name, value: t.value })),
    },
    {
      name: "modules",
      label: "公开展示模块",
      type: "group",
      fields: [
        {
          name: "timeline",
          label: "成长时间轴",
          type: "checkbox",
          defaultValue: true,
        },
        {
          name: "works",
          label: "作品展厅",
          type: "checkbox",
          defaultValue: true,
        },
        {
          name: "honors",
          label: "荣誉与里程碑",
          type: "checkbox",
          defaultValue: true,
        },
        {
          name: "projects",
          label: "成长项目",
          type: "checkbox",
          defaultValue: true,
        },
      ],
    },
  ],
};
