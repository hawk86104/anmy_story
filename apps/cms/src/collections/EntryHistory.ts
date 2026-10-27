import type { AccessResult, CollectionConfig } from "payload";
import { member } from "../lib/access";

export const EntryHistory: CollectionConfig = {
  slug: "entry-history",
  labels: { singular: "长期记录版本", plural: "长期记录版本" },
  admin: {
    group: "长期保存",
    defaultColumns: ["entry", "revision", "editorName", "createdAt"],
  },
  access: {
    create: () => false,
    update: () => false,
    delete: () => false,
    read: ({ req }): AccessResult => {
      const u = member(req);
      return !u
        ? false
        : u.role === "parent"
          ? { familyId: { equals: u.familyId } }
          : {
              and: [
                { familyId: { equals: u.familyId } },
                { author: { equals: u.id } },
              ],
            };
    },
  },
  fields: [
    {
      name: "versionKey",
      type: "text",
      unique: true,
      required: true,
      admin: { hidden: true },
    },
    {
      name: "entry",
      label: "成长记录",
      type: "relationship",
      relationTo: "entries",
      required: true,
    },
    { name: "revision", label: "版本", type: "number", required: true },
    {
      name: "familyId",
      type: "text",
      required: true,
      index: true,
      admin: { hidden: true },
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
    { name: "editorName", label: "修改人", type: "text" },
    { name: "snapshot", label: "记录快照", type: "json", required: true },
  ],
};
