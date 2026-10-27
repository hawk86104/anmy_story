import type { AccessResult, CollectionConfig } from "payload";
import { APIError } from "payload";
import { THEMES } from "@mylife/shared";
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
