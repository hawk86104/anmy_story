import { APIError } from "payload";
import { ENTRY_TYPES } from "@mylife/shared";

export function normalizeDate(date: unknown, precision: string): string | null {
  if (precision === "unknown") return null;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(date))
    throw new APIError("请选择发生时间，或选择“时间不确定”。", 400);
  const prefix = date.slice(0, 10);
  const parsed = new Date(`${prefix}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== prefix
  )
    throw new APIError("发生日期无效。", 400);
  const today = new Date().toISOString().slice(0, 10);
  const compare =
    precision === "year"
      ? prefix.slice(0, 4)
      : precision === "month"
        ? prefix.slice(0, 7)
        : prefix;
  if (compare > today.slice(0, compare.length))
    throw new APIError("成长记录的发生时间不能在未来。", 400);
  if (precision === "year") return `${prefix.slice(0, 4)}-01-01T00:00:00.000Z`;
  if (precision === "month") return `${prefix.slice(0, 7)}-01T00:00:00.000Z`;
  return parsed.toISOString();
}

export function validateEntry(data: Record<string, unknown>) {
  if (!ENTRY_TYPES.some((t) => t.value === data.type))
    throw new APIError("请选择记录方式。", 400);
  if (String(data.content || "").length > 50000)
    throw new APIError("正文过长，请分成多条记录。", 400);
  if (
    data.status === "saved" &&
    !String(data.content || "").trim() &&
    !(Array.isArray(data.media) && data.media.length)
  )
    throw new APIError("写下一点内容，或者添加一份照片、视频或录音吧。", 400);
  if (Array.isArray(data.media) && data.media.length > 12)
    throw new APIError("每条记录最多添加 12 份素材。", 400);
}

export function resolvePublication(input: {
  requestedVisibility: string;
  status: string;
}) {
  if (input.status !== "saved" || input.requestedVisibility !== "public")
    return {
      visibility: "family",
      reviewStatus: "none",
      publicRequested: false,
    };
  return {
    visibility: "public",
    reviewStatus: "approved",
    publicRequested: false,
  };
}
