import { createHash } from "node:crypto";
import {
  APIError,
  addDataAndFileToRequest,
  commitTransaction,
  initTransaction,
  killTransaction,
  type Endpoint,
  type PayloadRequest,
} from "payload";
import type { EntryInput, EntryType } from "@mylife/shared";
import { member } from "./access";
import { normalizeDate, validateEntry } from "./entry-policy";
import { json } from "./public-entries";

const MAX_ROWS = 200;
const headers: Record<string, string> = {
  externalId: "externalId",
  id: "externalId",
  外部ID: "externalId",
  type: "type",
  类型: "type",
  title: "title",
  标题: "title",
  content: "content",
  正文: "content",
  occurredAt: "occurredAt",
  日期: "occurredAt",
  datePrecision: "datePrecision",
  时间精度: "datePrecision",
  dateNote: "dateNote",
  时间说明: "dateNote",
  tags: "tags",
  标签: "tags",
  reflection: "reflection",
  感受: "reflection",
  learning: "learning",
  收获: "learning",
};

/** RFC 4180 quoted fields, including commas, escaped quotes and multiline text. */
export function parseHistoryCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cells: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const finishCell = () => {
    cells.push(cell);
    cell = "";
    closed = false;
  };
  const finishRow = () => {
    finishCell();
    if (cells.some((value) => value.trim())) rows.push(cells);
    cells = [];
    if (rows.length > MAX_ROWS + 1)
      throw new APIError("每次最多导入 200 条，请拆成多个文件。", 400);
  };
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === ",") finishCell();
    else if (char === "\r" || char === "\n") {
      finishRow();
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else if (closed) {
      if (!/\s/.test(char))
        throw new APIError("CSV 的引号后应为逗号或换行。", 400);
    } else if (char === '"') {
      if (cell)
        throw new APIError(
          "含双引号的 CSV 内容需要用双引号包围，并将引号写成两个。",
          400,
        );
      quoted = true;
    } else cell += char;
  }
  if (quoted) throw new APIError("CSV 中有未闭合的双引号，请检查文件。", 400);
  if (cell || cells.length || closed) finishRow();
  const columns = rows
    .shift()
    ?.map((name) =>
      Object.hasOwn(headers, name.trim()) ? headers[name.trim()] : "",
    );
  if (!columns?.includes("content") || columns.some((name) => !name))
    throw new APIError(
      "CSV 需要 content（正文）列；请按下载的模板填写列名。",
      400,
    );
  if (new Set(columns).size !== columns.length)
    throw new APIError("CSV 中有重复的列名。", 400);
  return rows.map((values) => {
    if (values.length !== columns.length)
      throw new APIError(
        "CSV 的列数不一致，请检查含逗号或换行的内容是否已加引号。",
        400,
      );
    return Object.fromEntries(columns.map((name, i) => [name, values[i]]));
  });
}

function string(value: unknown, label: string, max: number) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string")
    throw new APIError(`${label}需要是文字。`, 400);
  if (value.length > max)
    throw new APIError(`${label}不能超过 ${max} 字。`, 400);
  return value;
}

function normalize(row: unknown): EntryInput & { externalId: string } {
  if (!row || typeof row !== "object" || Array.isArray(row))
    throw new Error("每条记录需要是一个对象。");
  const r = row as Record<string, unknown>;
  const types: Record<string, EntryType> = {
    quick: "quick",
    story: "story",
    work: "work",
    honor: "honor",
    随手记: "quick",
    故事: "story",
    作品: "work",
    荣誉: "honor",
    里程碑: "honor",
    小里程碑: "honor",
  };
  const typeKey = String(r.type || "quick");
  const type = Object.hasOwn(types, typeKey) ? types[typeKey] : undefined;
  if (!type) throw new Error("类型应为 quick、story、work 或 honor。");
  const date = string(r.occurredAt, "日期", 40).trim();
  const precision =
    r.datePrecision ||
    (date.length === 4
      ? "year"
      : date.length === 7
        ? "month"
        : date
          ? "day"
          : "unknown");
  if (!["day", "month", "year", "unknown"].includes(String(precision)))
    throw new Error("时间精度应为 day、month、year 或 unknown。");
  const datePrecision = precision as EntryInput["datePrecision"];
  const occurredAt =
    datePrecision === "unknown"
      ? null
      : normalizeDate(
          date.length === 4
            ? `${date}-01-01`
            : date.length === 7
              ? `${date}-01`
              : date,
          datePrecision,
        );
  const tags =
    typeof r.tags === "string"
      ? r.tags
          .split(/[|，,]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : r.tags || [];
  if (
    !Array.isArray(tags) ||
    tags.length > 8 ||
    tags.some(
      (tag) => typeof tag !== "string" || !tag.trim() || tag.length > 20,
    )
  )
    throw new Error("标签最多 8 个，每个 1–20 字，CSV 中用 | 分隔。");
  const input: EntryInput & { externalId: string } = {
    externalId: string(
      r.externalId === undefined && typeof r.id === "number"
        ? String(r.id)
        : (r.externalId ?? r.id),
      "外部 ID",
      200,
    ),
    type,
    title: string(r.title, "标题", 160),
    content: string(r.content, "正文", 50000),
    reflection: string(r.reflection, "感受", 10000),
    learning: string(r.learning, "收获", 10000),
    occurredAt,
    datePrecision,
    dateNote: string(r.dateNote, "时间说明", 200),
    retrospective: true,
    tags: [...new Set(tags.map((tag) => String(tag).trim()))].map((label) => ({
      label,
    })),
    media: [],
    visibility: "family",
    status: "saved",
    clientId: "",
  };
  validateEntry(input as unknown as Record<string, unknown>);
  return input;
}

export async function previewHistoryImport(
  req: PayloadRequest,
  input: Record<string, unknown>,
) {
  const user = member(req);
  if (user?.role !== "parent")
    throw new APIError("仅家长可以批量导入历史资料。", 403);
  const text = string(input.text, "文件内容", 1024 * 1024);
  if (Buffer.byteLength(text, "utf8") > 1024 * 1024)
    throw new APIError("每个文件最多 1 MB，请分批导入。", 400);
  const source = string(input.source, "来源标识", 100).trim();
  if (!source)
    throw new APIError("请填写来源标识，重复导入会据此识别同一批资料。", 400);
  const authorId = Number(input.authorId);
  if (!Number.isSafeInteger(authorId) || authorId < 1)
    throw new APIError("请选择记录归属的家庭成员。", 400);
  const authors = await req.payload.find({
    collection: "users",
    where: {
      and: [
        { id: { equals: authorId } },
        { familyId: { equals: user.familyId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: req.user,
    req,
  });
  if (!authors.docs.length)
    throw new APIError("只能导入到本家庭成员的记录空间。", 403);
  let records: unknown;
  if (input.format === "csv") records = parseHistoryCSV(text);
  else if (input.format === "json") {
    try {
      const data = JSON.parse(text.replace(/^\uFEFF/, ""));
      records = Array.isArray(data) ? data : data?.entries;
    } catch {
      throw new APIError("JSON 格式无效，请检查文件。", 400);
    }
  } else throw new APIError("请选择 UTF-8 CSV 或 JSON 文件。", 400);
  if (!Array.isArray(records) || !records.length || records.length > MAX_ROWS)
    throw new APIError("文件需要包含 1–200 条记录。", 400);
  const seen = new Set<string>();
  const rows = records.map((record, index) => {
    try {
      const { externalId, ...data } = normalize(record);
      const identity = externalId
        ? `id:${externalId}`
        : `content:${JSON.stringify(data)}`;
      data.clientId = `import-${createHash("sha256")
        .update(JSON.stringify([user.familyId, authorId, source, identity]))
        .digest("hex")}`;
      const duplicate = seen.has(data.clientId);
      seen.add(data.clientId);
      return {
        row: index + 1,
        data,
        status: duplicate ? ("duplicate" as const) : ("ready" as const),
        message: duplicate ? "文件内重复，跳过" : "待导入",
        existingId: undefined as number | undefined,
      };
    } catch (error) {
      return {
        row: index + 1,
        data: undefined,
        status: "error" as const,
        message: (error as Error).message,
        existingId: undefined as number | undefined,
      };
    }
  });
  const keys = rows.flatMap((row) => (row.data ? [row.data.clientId] : []));
  const existing = keys.length
    ? await req.payload.find({
        collection: "entries",
        where: {
          and: [
            { familyId: { equals: user.familyId } },
            { clientId: { in: keys } },
          ],
        },
        limit: MAX_ROWS,
        depth: 0,
        overrideAccess: false,
        user: req.user,
        req,
      })
    : { docs: [] };
  const prior = new Map(
    existing.docs.map((entry) => [entry.clientId, entry.id]),
  );
  for (const row of rows)
    if (row.data && prior.has(row.data.clientId)) {
      row.status = "duplicate";
      row.message = "已导入，保留现有记录";
      row.existingId = prior.get(row.data.clientId);
    }
  return { authorId, source, rows };
}

export const historyImportEndpoints: Endpoint[] = ["preview", "apply"].map(
  (action) => ({
    path: `/family/import/${action}`,
    method: "post",
    handler: async (req) => {
      if (member(req)?.role !== "parent")
        return json({ error: "仅家长可以批量导入历史资料。" }, 403);
      let started = false;
      try {
        await addDataAndFileToRequest(req);
        if (action === "apply") started = await initTransaction(req);
        const plan = await previewHistoryImport(req, req.data || {});
        const errors = plan.rows.filter((row) => row.status === "error").length;
        if (action === "preview")
          return json({
            source: plan.source,
            authorId: plan.authorId,
            total: plan.rows.length,
            errors,
            ready: plan.rows.filter((row) => row.status === "ready").length,
            duplicates: plan.rows.filter((row) => row.status === "duplicate")
              .length,
            rows: plan.rows.map((row) => ({
              row: row.row,
              title:
                row.data?.title || row.data?.content.slice(0, 32) || "无法读取",
              excerpt: row.data?.content.slice(0, 160) || "",
              occurredAt: row.data?.occurredAt,
              datePrecision: row.data?.datePrecision || "unknown",
              status: row.status,
              message: row.message,
            })),
          });
        if (errors)
          throw new APIError(
            `有 ${errors} 条资料需要修正，尚未导入任何记录。`,
            400,
          );
        const entries: { id: number; title: string }[] = [];
        req.context.importHistory = true;
        for (const row of plan.rows) {
          if (row.status !== "ready" || !row.data) continue;
          const entry = await req.payload.create({
            collection: "entries",
            data: {
              ...row.data,
              author: plan.authorId,
              familyId: member(req)!.familyId,
            },
            overrideAccess: false,
            user: req.user,
            req,
            depth: 0,
          });
          entries.push({
            id: entry.id,
            title: entry.title || (entry.content || "").slice(0, 32),
          });
        }
        if (started) await commitTransaction(req);
        return json({
          created: entries.length,
          skipped: plan.rows.length - entries.length,
          entries,
        });
      } catch (error) {
        if (started) await killTransaction(req);
        if (error instanceof APIError)
          return json({ error: error.message }, error.status);
        req.payload.logger.error({
          err: error,
          msg: "历史资料导入失败，事务已撤销",
        });
        return json(
          { error: "导入未完成，已撤销本次写入。请重新预览后重试。" },
          500,
        );
      }
    },
  }),
);
