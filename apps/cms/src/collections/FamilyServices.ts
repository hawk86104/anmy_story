import {
  APIError,
  type Access,
  type AccessResult,
  type CollectionConfig,
} from "payload";
import { member, parentOnly } from "../lib/access";
const parentFamily: Access = ({ req }): AccessResult => {
  const u = member(req);
  return u?.role === "parent" ? { familyId: { equals: u.familyId } } : false;
};
export const FamilyServices: CollectionConfig = {
  slug: "family-services",
  labels: { singular: "家庭服务设置", plural: "家庭服务设置" },
  admin: { group: "长期保存", useAsTitle: "familyId" },
  access: {
    create: parentOnly,
    read: parentFamily,
    update: parentFamily,
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc, req }) => {
        const u = member(req);
        if (u?.role !== "parent")
          throw new APIError("仅家长可以配置家庭服务。", 403);
        data.familyId = originalDoc?.familyId || u.familyId;
        if (!req.context.serviceSettings) {
          data.keyCipher = originalDoc?.keyCipher || null;
        }
        const merged = { ...originalDoc, ...data };
        if (
          merged.enabled &&
          (!merged.consent ||
            !merged.endpoint ||
            !merged.model ||
            !merged.keyCipher)
        )
          throw new APIError(
            "开启前请配置服务、模型和密钥，并确认数据处理授权。",
            400,
          );
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
      name: "enabled",
      label: "启用 AI 整理",
      type: "checkbox",
      defaultValue: false,
    },
    { name: "endpoint", label: "兼容接口地址", type: "text", maxLength: 1000 },
    { name: "model", label: "文字整理模型", type: "text", maxLength: 200 },
    {
      name: "transcriptionModel",
      label: "语音转写模型",
      type: "text",
      maxLength: 200,
    },
    {
      name: "keyCipher",
      type: "text",
      admin: { hidden: true },
      access: { read: () => false, create: () => false, update: () => false },
    },
    {
      name: "consent",
      label: "家长确认数据处理授权",
      type: "checkbox",
      defaultValue: false,
    },
    { name: "consentAt", type: "date", admin: { readOnly: true } },
    {
      name: "preserveOriginals",
      label: "新上传照片与视频保留原件",
      type: "checkbox",
      defaultValue: false,
    },
    {
      name: "lastExportAt",
      label: "最近发起导出",
      type: "date",
      admin: { readOnly: true },
    },
  ],
};
