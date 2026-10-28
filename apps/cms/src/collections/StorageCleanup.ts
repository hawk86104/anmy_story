import type { CollectionConfig } from "payload";

/** Commit deletion intent with the database; remote deletion is safely retried. */
export const StorageCleanup: CollectionConfig = {
  slug: "storage-cleanup",
  admin: { hidden: true },
  access: {
    create: () => false,
    read: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: "familyId", type: "text", required: true, index: true },
    { name: "objectKey", type: "text", required: true },
    {
      name: "storage",
      type: "select",
      options: ["local", "cos"],
      required: true,
    },
    { name: "original", type: "checkbox", defaultValue: false },
  ],
};
