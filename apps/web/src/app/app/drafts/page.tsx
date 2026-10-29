"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FilePenLine, LoaderCircle, Plus } from "lucide-react";
import { ENTRY_TYPES, type Entry } from "@mylife/shared";
import { useSession } from "@/components/session";
import { api } from "@/lib/api";
import { listDeviceDrafts, type Draft } from "@/lib/drafts";
import { readOfflineDraft } from "@/lib/offline-draft";
import { markdownEntryTitle, markdownExcerpt } from "@/lib/markdown-text";

type LocalDraft = { id: number | null; draft: Draft };

export default function DraftsPage() {
  const { user } = useSession();
  const [local, setLocal] = useState<LocalDraft[]>([]);
  const [offline, setOffline] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [localError, setLocalError] = useState("");
  const [localLoading, setLocalLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.allSettled([listDeviceDrafts(user), readOfflineDraft()]).then(
      ([drafts, offlineDraft]) => {
        if (!active) return;
        if (drafts.status === "fulfilled") setLocal(drafts.value);
        if (offlineDraft.status === "fulfilled")
          setOffline(Boolean(offlineDraft.value));
        if (drafts.status === "rejected" || offlineDraft.status === "rejected")
          setLocalError("暂时无法读取部分本设备草稿，请检查浏览器存储后重试。");
        setLocalLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [user.id, user.familyId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      "where[status][equals]": "draft",
      sort: "-updatedAt",
      limit: "20",
      depth: "1",
      page: String(page),
    });
    api<{ docs: Entry[]; hasNextPage: boolean }>(`/entries?${query}`)
      .then((result) => {
        if (!active) return;
        setEntries((old) =>
          page === 1 ? result.docs : [...old, ...result.docs],
        );
        setHasMore(result.hasNextPage);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, user.id, user.familyId]);

  return (
    <main className="page-content drafts-page">
      <div className="page-heading heading-with-action">
        <div>
          <span className="eyebrow">KEEP WRITING</span>
          <h1>
            我的草稿<span className="heading-star">✳</span>
          </h1>
          <p>没写完的记忆，可以随时接着写。</p>
        </div>
        <Link className="primary-button" href="/app/new">
          <Plus size={17} />
          记一件事
        </Link>
      </div>
      <section className="draft-group">
        <div className="section-heading">
          <div>
            <h2>家庭空间的草稿</h2>
            <p className="muted">
              点击“存草稿”后会保存在家庭空间，登录其他设备也能继续写。
            </p>
          </div>
        </div>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {entries.length > 0 ? (
          <div className="draft-list">
            {entries.map((entry) => (
              <Link
                className="draft-list-item"
                key={entry.id}
                href={`/app/entries/${entry.id}?edit=1`}
              >
                <FilePenLine size={21} />
                <div>
                  <strong>{markdownEntryTitle(entry)}</strong>
                  <span>
                    {markdownExcerpt(entry.content, 100) ||
                      "这段记忆以素材开始。"}
                  </span>
                  <small>
                    {
                      ENTRY_TYPES.find((type) => type.value === entry.type)
                        ?.label
                    }{" "}
                    · 更新于 {new Date(entry.updatedAt).toLocaleString("zh-CN")}
                  </small>
                </div>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        ) : (
          !loading &&
          !error && <p className="muted">还没有保存到家庭空间的草稿。</p>
        )}
        {loading && (
          <p className="muted">
            <LoaderCircle className="spin" size={16} /> 正在读取家庭草稿…
          </p>
        )}
        {hasMore && (
          <button
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={() => setPage((value) => value + 1)}
          >
            查看更多草稿
          </button>
        )}
      </section>
      <section className="draft-group">
        <div className="section-heading">
          <div>
            <h2>本设备的自动草稿</h2>
            <p className="muted">
              仅保存在当前浏览器中；打开后可继续编辑并保存到家庭空间。
            </p>
          </div>
        </div>
        {localError && (
          <p className="error-box" role="alert">
            {localError}
          </p>
        )}
        {local.length || offline ? (
          <div className="draft-list">
            {local.map(({ id, draft }) => (
              <Link
                className="draft-list-item"
                key={id || "new"}
                href={
                  id ? `/app/entries/${id}?edit=1&deviceDraft=1` : "/app/new"
                }
              >
                <FilePenLine size={21} />
                <div>
                  <strong>
                    {draft.title?.trim() ||
                      markdownExcerpt(draft.content, 45) ||
                      "未命名草稿"}
                  </strong>
                  <span>
                    {id
                      ? "一条已有记录的未保存修改"
                      : "尚未保存到家庭空间的新记录"}
                  </span>
                  <small>
                    {draft.updatedAt
                      ? `更新于 ${new Date(draft.updatedAt).toLocaleString("zh-CN")}`
                      : "保存在本设备"}
                  </small>
                </div>
                <ArrowRight size={17} />
              </Link>
            ))}
            {offline && (
              <Link className="draft-list-item" href="/app/new">
                <FilePenLine size={21} />
                <div>
                  <strong>离线时写下的草稿</strong>
                  <span>打开编辑器后选择“带回编辑器”。</span>
                </div>
                <ArrowRight size={17} />
              </Link>
            )}
          </div>
        ) : (
          !localError &&
          !localLoading && <p className="muted">本设备没有未保存的自动草稿。</p>
        )}
        {localLoading && <p className="muted">正在读取本设备草稿…</p>}
      </section>
    </main>
  );
}
