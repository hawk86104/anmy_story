"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileUp } from "lucide-react";
import type { Member } from "@mylife/shared";
import { displayDate } from "@mylife/shared";
import { api } from "@/lib/api";

type Input = {
  format: "csv" | "json";
  text: string;
  source: string;
  authorId: number;
};
type Preview = {
  total: number;
  ready: number;
  duplicates: number;
  errors: number;
  rows: {
    row: number;
    title: string;
    excerpt: string;
    occurredAt?: string | null;
    datePrecision: "day" | "month" | "year" | "unknown";
    status: string;
    message: string;
  }[];
};
type Result = {
  created: number;
  skipped: number;
  entries: { id: number; title: string }[];
};

export function HistoryImport() {
  const [input, setInput] = useState<Input>({
    format: "csv",
    text: "",
    source: "",
    authorId: 0,
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reviewed, setReviewed] = useState<Input | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ docs: Member[] }>("/users?limit=100&depth=0")
      .then(({ docs }) => {
        if (!active) return;
        setMembers(docs);
        setInput((value) => ({
          ...value,
          authorId: (docs.find((m) => m.role === "child") || docs[0])?.id || 0,
        }));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  function change(next: Partial<Input>) {
    setInput((value) => ({ ...value, ...next }));
    setPreview(null);
    setReviewed(null);
    setResult(null);
    setError("");
  }
  async function loadFile(file?: File) {
    if (!file) return;
    setError("");
    setPreview(null);
    setReviewed(null);
    setResult(null);
    if (file.size > 1024 * 1024) {
      setError("每个文件最多 1 MB，请分批导入。");
      return;
    }
    if (!/\.(csv|json)$/i.test(file.name)) {
      setError("请选择 .csv 或 .json 文件。");
      return;
    }
    setBusy(true);
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      setInput((value) => ({
        ...value,
        text,
        source: value.source || file.name.replace(/\.[^.]+$/, "").slice(0, 100),
        format: /\.csv$/i.test(file.name) ? "csv" : "json",
      }));
    } catch {
      setError("文件需要使用 UTF-8 编码，请另存为 UTF-8 后再上传。");
    } finally {
      setBusy(false);
    }
  }
  function template() {
    const url = URL.createObjectURL(
      new Blob(
        [
          "\uFEFFexternalId,type,title,content,occurredAt,datePrecision,dateNote,tags,reflection,learning\r\n",
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "成长记录导入模板.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function inspect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    setReviewed(null);
    try {
      const data = await api<Preview>("/family/import/preview", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setPreview(data);
      setReviewed({ ...input });
    } catch (e) {
      setPreview(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!reviewed || !preview || preview.errors || !preview.ready || busy)
      return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await api<Result>("/family/import/apply", {
          method: "POST",
          body: JSON.stringify(reviewed),
        }),
      );
      setPreview(null);
      setReviewed(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="import-workspace">
      <section className="import-panel">
        <h2>
          <FileUp size={22} /> 把以前的记忆带回来
        </h2>
        <p>
          从 UTF-8 CSV 或 JSON 批量导入文字记录，每次最多 200 条、1
          MB。先预览并修正，再一次导入。
        </p>
        <p className="muted">
          所有导入先设为“仅自己和家长可见”。照片、视频可在导入后通过编辑器添加。相同来源、成员和外部
          ID 会识别为重复，保留已有内容。
        </p>
        <button className="text-button" type="button" onClick={template}>
          <Download size={16} /> 下载 CSV 空模板
        </button>
        <form className="import-form" onSubmit={inspect}>
          <label>
            选择文件
            <input
              disabled={busy}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={(e) => void loadFile(e.target.files?.[0])}
            />
          </label>
          <div className="import-fields">
            <label>
              记录归属
              <select
                disabled={busy}
                required
                value={input.authorId || ""}
                onChange={(e) => change({ authorId: Number(e.target.value) })}
              >
                <option value="" disabled>
                  选择家庭成员
                </option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}（{member.role === "child" ? "孩子" : "家长"}）
                  </option>
                ))}
              </select>
            </label>
            <label>
              来源标识
              <input
                disabled={busy}
                required
                maxLength={100}
                placeholder="例如：幼儿园旧日记"
                value={input.source}
                onChange={(e) => change({ source: e.target.value })}
              />
              <small>同一批资料再次导入时，使用同一来源标识。</small>
            </label>
          </div>
          <label>
            文件格式
            <select
              disabled={busy}
              value={input.format}
              onChange={(e) =>
                change({ format: e.target.value as Input["format"] })
              }
            >
              <option value="csv">CSV 表格</option>
              <option value="json">JSON 数组或含 entries 的对象</option>
            </select>
          </label>
          <label>
            文件内容，也可以直接粘贴
            <textarea
              disabled={busy}
              required
              rows={9}
              maxLength={1024 * 1024}
              value={input.text}
              onChange={(e) => change({ text: e.target.value })}
              spellCheck={false}
            />
          </label>
          <small className="muted">
            日期支持 2020、2020-05、2020-05-12；不确定时留空。类型为 quick /
            story / work / honor，标签用 | 分隔。含逗号、引号或换行的 CSV
            单元格需按 CSV 格式加引号。
          </small>
          <button
            className="primary-button"
            disabled={busy || !members.length}
            type="submit"
          >
            {busy ? "正在处理…" : "预览导入内容"}
          </button>
        </form>
      </section>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <section className="import-panel" aria-live="polite">
          <h2>导入前确认</h2>
          <p>
            共 {preview.total} 条 · 可导入 {preview.ready} 条 · 重复跳过{" "}
            {preview.duplicates} 条 · 需修正 {preview.errors} 条
          </p>
          {preview.errors > 0 && (
            <p className="notice error">
              请修正错误后重新预览；本次尚未写入记录。
            </p>
          )}
          <div className="import-preview">
            {preview.rows.map((row) => (
              <article key={row.row} className={`import-row ${row.status}`}>
                <div>
                  <strong>
                    {row.row}. {row.title}
                  </strong>
                  <span>{row.message}</span>
                </div>
                <p>{row.excerpt}</p>
                <small>{displayDate(row)}</small>
              </article>
            ))}
          </div>
          <button
            className="primary-button"
            disabled={busy || !!preview.errors || !preview.ready}
            onClick={() => void apply()}
          >
            {busy ? "正在导入…" : `导入 ${preview.ready} 条私密记录`}
          </button>
        </section>
      )}
      {result && (
        <section className="import-panel" aria-live="polite">
          <h2>记忆已经收好</h2>
          <p>
            已导入 {result.created} 条，跳过重复 {result.skipped}{" "}
            条。可以进入记录编辑器补充素材、关联项目或选择公开。
          </p>
          <ul>
            {result.entries.slice(0, 10).map((entry) => (
              <li key={entry.id}>
                <Link
                  className="text-button"
                  href={`/app/manage/entries/${entry.id}`}
                >
                  {entry.title || "查看记录"}
                </Link>
              </li>
            ))}
          </ul>
          <Link className="primary-button" href="/app/manage/entries">
            查看家庭记录
          </Link>
        </section>
      )}
    </div>
  );
}
