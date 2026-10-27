import type { AccessResult, CollectionConfig } from "payload";
import { APIError } from "payload";
import { member, parentOnly } from "../lib/access";

export const Users: CollectionConfig = {
  slug: "users",
  labels: { singular: "家庭成员", plural: "家庭成员" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "email", "role"],
    group: "家庭与权限",
  },
  auth: {
    tokenExpiration: 60 * 60 * 24 * 7,
    maxLoginAttempts: 8,
    lockTime: 10 * 60 * 1000,
    cookies: { sameSite: "Lax", secure: process.env.NODE_ENV === "production" },
  },
  access: {
    admin: ({ req }) => member(req)?.role === "parent",
    create: parentOnly,
    delete: () => false,
    read: ({ req }): AccessResult => {
      const u = member(req);
      if (!u) return false;
      return u.role === "parent"
        ? { familyId: { equals: u.familyId } }
        : { id: { equals: u.id } };
    },
    update: ({ req }): AccessResult => {
      const u = member(req);
      if (!u) return false;
      return u.role === "parent"
        ? { familyId: { equals: u.familyId } }
        : { id: { equals: u.id } };
    },
  },
  hooks: {
    beforeChange: [
      async ({ data, req, originalDoc, context }) => {
        if (context.bootstrap) return data;
        const u = member(req);
        if (!u) throw new APIError("请先登录。", 401);
        data.familyId = originalDoc?.familyId || u.familyId;
        if (originalDoc?.role === "parent" && data.role === "child") {
          const parents = await req.payload.count({
            collection: "users",
            where: {
              and: [
                { familyId: { equals: u.familyId } },
                { role: { equals: "parent" } },
                { id: { not_equals: originalDoc.id } },
              ],
            },
            overrideAccess: true,
            req,
          });
          if (!parents.totalDocs)
            throw new APIError("家庭空间至少需要保留一位家长。", 400);
        }
        if (u.role !== "parent") {
          data.role = originalDoc?.role || "child";
          data.allowPublicPublishing =
            originalDoc?.allowPublicPublishing || false;
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "name",
      label: "称呼",
      type: "text",
      required: true,
      maxLength: 60,
    },
    {
      name: "role",
      label: "家庭角色",
      type: "select",
      required: true,
      defaultValue: "child",
      options: [
        { label: "孩子", value: "child" },
        { label: "家长", value: "parent" },
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
      access: { create: () => false, update: () => false },
    },
    {
      name: "allowPublicPublishing",
      label: "允许孩子自主公开",
      type: "checkbox",
      defaultValue: false,
      admin: {
        hidden: true,
        description: "旧版兼容字段。孩子现在可以直接选择公开，无需预授权。",
      },
      access: {
        create: ({ req }) => member(req)?.role === "parent",
        update: ({ req }) => member(req)?.role === "parent",
      },
    },
  ],
};
