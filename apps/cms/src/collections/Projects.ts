import type { AccessResult, CollectionConfig } from "payload";
import { APIError } from "payload";
import { authenticated, familyOnly, member, relationId } from "../lib/access";

export const Projects: CollectionConfig = {
  slug: "projects",
  labels: { singular: "成长项目", plural: "成长项目" },
  admin: { useAsTitle: "title", group: "成长档案" },
  access: {
    create: authenticated,
    read: ({ req }): AccessResult => {
      const u = member(req);
      return !u
        ? false
        : u.role === "parent"
          ? { familyId: { equals: u.familyId } }
          : {
              and: [
                { familyId: { equals: u.familyId } },
                { owner: { equals: u.id } },
              ],
            };
    },
    delete: () => false,
    update: ({ req }): AccessResult => {
      const u = member(req);
      return !u
        ? false
        : u.role === "parent"
          ? { familyId: { equals: u.familyId } }
          : {
              and: [
                { familyId: { equals: u.familyId } },
                { owner: { equals: u.id } },
              ],
            };
    },
  },
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        const u = member(req);
        if (!u) throw new APIError("请先登录。", 401);
        data.familyId = originalDoc?.familyId || u.familyId;
        data.owner = originalDoc?.owner ? relationId(originalDoc.owner) : u.id;
        if (!originalDoc?.id && u.role === "parent") {
          const space = await req.payload.find({
            collection: "spaces",
            where: { familyId: { equals: u.familyId } },
            depth: 0,
            limit: 1,
            overrideAccess: true,
            req,
          });
          if (space.docs[0]) data.owner = relationId(space.docs[0].owner);
          else {
            const children = await req.payload.find({
              collection: "users",
              where: {
                and: [
                  { familyId: { equals: u.familyId } },
                  { role: { equals: "child" } },
                ],
              },
              depth: 0,
              limit: 1,
              overrideAccess: true,
              req,
            });
            data.owner = children.docs[0]?.id || u.id;
          }
        }
        const cover = relationId(data.cover ?? originalDoc?.cover);
        if (cover) {
          const file = await req.payload.find({
            collection: "media",
            where: {
              and: [
                { id: { equals: cover } },
                { familyId: { equals: u.familyId } },
                { mimeType: { like: "image/" } },
              ],
            },
            depth: 0,
            limit: 1,
            user: req.user,
            overrideAccess: false,
            req,
          });
          if (!file.docs.length)
            throw new APIError("请选择本家庭可访问的照片作为项目封面。", 403);
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "title",
      label: "项目名称",
      type: "text",
      required: true,
      maxLength: 100,
    },
    { name: "summary", label: "一句话介绍", type: "text", maxLength: 240 },
    {
      name: "description",
      label: "这个小计划从哪里开始",
      type: "textarea",
      maxLength: 10000,
    },
    { name: "startedAt", label: "开始时间", type: "date" },
    {
      name: "status",
      label: "进展",
      type: "select",
      defaultValue: "exploring",
      required: true,
      options: [
        { label: "正在探索", value: "exploring" },
        { label: "已经完成", value: "completed" },
      ],
    },
    {
      name: "visibility",
      label: "可见范围",
      type: "select",
      defaultValue: "family",
      required: true,
      options: [
        { label: "仅自己和家长可见", value: "family" },
        { label: "所有人可见", value: "public" },
      ],
    },
    {
      name: "cover",
      label: "项目封面",
      type: "relationship",
      relationTo: "media",
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
      required: true,
      admin: { readOnly: true },
    },
  ],
};
