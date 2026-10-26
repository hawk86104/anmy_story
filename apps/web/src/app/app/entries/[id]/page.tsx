"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Pencil,
  LockKeyhole,
  Globe2,
  History,
  CheckCircle2,
  Archive,
  LoaderCircle,
} from "lucide-react";
import type { Entry, Media } from "@mylife/shared";
import { displayDate, entryTitle, ENTRY_TYPES } from "@mylife/shared";
import { api } from "@/lib/api";
import { useSession } from "@/components/session";
import { MediaView } from "@/components/media-view";
import { EntryEditor } from "@/components/entry-editor";
export default function EntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useSession();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<
    { id: number; version: Entry; createdAt: string }[] | null
  >(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<Entry>(`/entries/${encodeURIComponent(id)}?depth=1`)
        .then(setEntry)
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    void load();
    setSaved(new URLSearchParams(location.search).has("saved"));
    setEditing(new URLSearchParams(location.search).has("edit"));
  }, [load]);
  useEffect(() => {
    if (
      editing ||
      !entry?.media?.some(
        (m) =>
          typeof m !== "number" &&
          ["queued", "processing"].includes(m.processingStatus),
      )
    )
      return;
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [entry, load, editing]);
  async function update(data: Partial<Entry>) {
    if (!entry) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ doc: Entry }>(`/entries/${entry.id}?depth=1`, {
        method: "PATCH",
        body: JSON.stringify({ ...data, revision: entry.revision }),
      });
      setEntry(r.doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "修改未成功。");
    } finally {
      setBusy(false);
    }
  }
  if (!entry)
    return (
      <main className="page-content">
        <Link className="back-link" href="/app/entries">
          <ArrowLeft size={16} />
          返回时间轴
        </Link>
        {error ? (
          <p className="error-box" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted">正在翻开这段记忆…</p>
        )}
      </main>
    );
  const authorId =
    typeof entry.author === "number" ? entry.author : entry.author.id;
  const canEdit = user.role === "parent" || user.id === authorId;
  if (editing && canEdit)
    return (
      <>
        <button className="cancel-edit" onClick={() => setEditing(false)}>
          <ArrowLeft size={16} />
          回到这段记忆
        </button>
        <EntryEditor
          key={`${entry.id}-${entry.revision}`}
          entry={entry}
          onSaved={(updated) => {
            setEntry(updated);
            setEditing(false);
            setSaved(true);
            setHistory(null);
          }}
        />
      </>
    );
  return (
    <main className="page-content detail-page">
      <Link className="back-link" href="/app/entries">
        <ArrowLeft size={16} />
        返回成长时间轴
      </Link>
      {saved && (
        <div className="saved-celebration">
          <CheckCircle2 size={24} />
          <div>
            <strong>
              {entry.status === "draft"
                ? "草稿已保存在家庭空间"
                : "这一刻，好好收藏了。"}
            </strong>
            <p>
              {entry.visibility === "public"
                ? "这段记忆已经公开，所有人（包括游客）都能查看。"
                : "已经留在家庭空间，只有你和家长可以查看。"}
            </p>
          </div>
          <button aria-label="关闭保存提示" onClick={() => setSaved(false)}>
            ×
          </button>
        </div>
      )}
      <article className="detail-card">
        <div className="detail-topline">
          <span className="type-label">
            {ENTRY_TYPES.find((t) => t.value === entry.type)?.label}
          </span>
          <span className="detail-date">
            {displayDate(entry)}
            {entry.retrospective && " · 回忆补录"}
          </span>
        </div>
        <h1>{entryTitle(entry)}</h1>
        <div className="detail-byline">
          <span className="avatar small">
            {typeof entry.author === "number"
              ? "记"
              : entry.author.name?.slice(0, 1) || "记"}
          </span>
          <span>
            {typeof entry.author === "number" ? "家人记录" : entry.author.name}
          </span>
          <span>·</span>
          <span>
            {entry.visibility === "public" ? "所有人可见" : "仅自己和家长可见"}
          </span>
          {canEdit && (
            <button
              className="text-button"
              onClick={() => {
                setEditing(true);
                setSaved(false);
              }}
            >
              <Pencil size={14} />
              继续编辑
            </button>
          )}
        </div>
        <div className="detail-content">{entry.content}</div>
        {entry.reflection && (
          <section className="reflection-block">
            <span>那时候，我觉得…</span>
            <p>{entry.reflection}</p>
          </section>
        )}
        {entry.learning && (
          <section className="reflection-block learning">
            <span>我的小小收获</span>
            <p>{entry.learning}</p>
          </section>
        )}
        <div className="detail-media">
          {entry.media
            ?.filter((m): m is Media => typeof m !== "number")
            .map((m) => (
              <MediaView key={m.id} media={m} onRetry={() => void load()} />
            ))}
        </div>
        {entry.parentNote && (
          <section className="parent-note">
            <strong>家长的小小补充</strong>
            <p>{entry.parentNote}</p>
          </section>
        )}
        {Boolean(entry.tags?.length) && (
          <div className="detail-tags">
            {entry.tags?.map((t) => (
              <span className="tag" key={t.label}>
                #{t.label}
              </span>
            ))}
          </div>
        )}
        <details className="original-expression">
          <summary>最初的表达，一直都在</summary>
          <p>{entry.originalText || "这段记忆最初以素材开始。"}</p>
          <small>
            首次保存于 {new Date(entry.createdAt).toLocaleString("zh-CN")}
          </small>
        </details>
      </article>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="detail-actions">
        {canEdit && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void update({
                visibility: entry.visibility === "public" ? "family" : "public",
              })
            }
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : entry.visibility === "public" ? (
              <LockKeyhole size={15} />
            ) : (
              <Globe2 size={15} />
            )}
            {entry.visibility === "public"
              ? "改为仅自己和家长可见"
              : "公开这段记忆"}
          </button>
        )}
        {entry.visibility === "public" && entry.status === "saved" && (
          <Link className="text-button" href={`/entries/${entry.id}`}>
            <Globe2 size={15} />
            查看公开页面
          </Link>
        )}
        <button
          className="text-button"
          onClick={async () => {
            if (history) {
              setHistory(null);
              return;
            }
            try {
              const r = await api<{
                docs: { id: number; version: Entry; createdAt: string }[];
              }>(
                `/entries/versions?where[parent][equals]=${entry.id}&sort=-createdAt&limit=20`,
              );
              setHistory(r.docs);
            } catch (e) {
              setError(e instanceof Error ? e.message : "无法读取历史版本。");
            }
          }}
        >
          <History size={15} />
          {history ? "收起历史" : "查看修改历史"}
        </button>
        {canEdit && entry.status !== "archived" && (
          <button
            className="text-button archive-button"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "这段记忆会被收进归档，之后仍可在时间轴筛选查看。确定归档吗？",
                )
              )
                void update({ status: "archived", visibility: "family" });
            }}
          >
            <Archive size={15} />
            收进归档
          </button>
        )}
      </div>
      {history && (
        <section className="version-list">
          <h2>故事一路写来的样子</h2>
          {history.map((v) => (
            <details key={v.id}>
              <summary>
                <span>
                  版本 {v.version.revision || 1} ·{" "}
                  {v.version.editorName || "家庭成员"}
                </span>
                {new Date(v.createdAt).toLocaleString("zh-CN")}
              </summary>
              <p>{v.version.content || "这版记录以素材开始。"}</p>
            </details>
          ))}
        </section>
      )}
      <div className="keep-writing">
        <p>还有其他想留住的事吗？</p>
        <Link className="primary-button" href="/app/new">
          再记一件小事
          <ArrowRight size={17} />
        </Link>
      </div>
    </main>
  );
}
