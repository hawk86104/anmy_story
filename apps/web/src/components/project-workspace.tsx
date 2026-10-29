"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderHeart,
  Globe2,
  LockKeyhole,
  Plus,
} from "lucide-react";
import {
  ENTRY_LIST_SORT,
  PROJECT_LIST_SORT,
  type Entry,
  type GrowthProject,
  type Media,
} from "@mylife/shared";
import { api } from "@/lib/api";
import { mediaUrl } from "@/lib/urls";
import { EmptyState, Usagi } from "./theme";
import { EntryCard } from "./entry-card";
import { MediaPicker } from "./media-picker";

export function ProjectWorkspace() {
  const [rows, setRows] = useState<GrowthProject[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false);
  useEffect(() => {
    let active = true;
    setBusy(true);
    api<{ docs: GrowthProject[]; hasNextPage: boolean }>(
      `/projects?depth=1&sort=${PROJECT_LIST_SORT}&limit=20&page=${page}`,
    )
      .then((r) => {
        if (active) {
          setRows((old) => (page === 1 ? r.docs : [...old, ...r.docs]));
          setMore(r.hasNextPage);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [page]);
  return (
    <main className="page-content projects-workspace">
      <div className="manage-heading">
        <div>
          <span className="eyebrow">A STORY IN THE MAKING</span>
          <h1>我的成长项目</h1>
          <p>把喜欢的事，慢慢做成一个故事。</p>
        </div>
        <Link className="primary-button" href="/app/projects/new">
          <Plus size={18} />
          新项目
        </Link>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {busy && !rows.length ? (
        <p className="muted">正在翻开小计划…</p>
      ) : rows.length ? (
        <div className="manage-links">
          {rows.map((p) => (
            <Link
              className="manage-record"
              href={`/app/projects/${p.id}`}
              key={p.id}
            >
              {p.cover && typeof p.cover !== "number" ? (
                <img src={mediaUrl(p.cover.url)} alt={p.cover.alt || p.title} />
              ) : (
                <Usagi size={80} />
              )}
              <div className="manage-record-content">
                <span className="site-tag sage">
                  {p.status === "completed" ? "已经完成" : "正在探索"}
                </span>
                <h2>{p.title}</h2>
                <p>{p.summary || "每一次尝试，都在把喜欢慢慢变成故事。"}</p>
                <p>
                  {p.visibility === "public" ? (
                    <>
                      <Globe2 size={12} /> 所有人可见
                    </>
                  ) : (
                    <>
                      <LockKeyhole size={12} /> 仅家庭可见
                    </>
                  )}
                </p>
              </div>
              <ArrowRight size={18} />
            </Link>
          ))}
        </div>
      ) : (
        !error && (
          <EmptyState
            title="下一个喜欢的小计划，正在酝酿。"
            description="从画一座房子、观察一棵树开始，给相关记忆找一个家。"
            action={
              <Link className="primary-button" href="/app/projects/new">
                <Plus size={17} />
                建立第一个小计划
              </Link>
            }
          />
        )
      )}
      {more && (
        <button
          className="load-more"
          disabled={busy}
          onClick={() => setPage((p) => p + 1)}
        >
          再看看更多小计划
        </button>
      )}
    </main>
  );
}

const blank: Omit<GrowthProject, "id"> = {
  title: "",
  summary: "",
  description: "",
  status: "exploring",
  visibility: "family",
  startedAt: null,
  cover: null,
};
export function ProjectEditor({ id }: { id: string }) {
  const fresh = id === "new",
    router = useRouter();
  const [form, setForm] = useState(blank),
    [ready, setReady] = useState(fresh),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    if (fresh) return;
    let active = true;
    Promise.all([
      api<GrowthProject>(`/projects/${encodeURIComponent(id)}?depth=1`),
      api<{ docs: Entry[] }>(
        `/entries?where[or][0][projects][in]=${encodeURIComponent(id)}&where[or][1][mainProject][equals]=${encodeURIComponent(id)}&sort=${ENTRY_LIST_SORT}&depth=1&limit=60`,
      ),
    ])
      .then(([p, r]) => {
        if (active) {
          setForm(p);
          setEntries(r.docs);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, fresh]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await api<{ doc: GrowthProject }>(
        fresh ? "/projects" : `/projects/${id}`,
        {
          method: fresh ? "POST" : "PATCH",
          body: JSON.stringify({
            title: form.title.trim(),
            summary: form.summary,
            description: form.description,
            status: form.status,
            visibility: form.visibility,
            startedAt: form.startedAt
              ? `${form.startedAt.slice(0, 10)}T00:00:00.000Z`
              : null,
            cover:
              typeof form.cover === "object"
                ? form.cover?.id || null
                : form.cover,
          }),
        },
      );
      setMessage("这个小计划已经好好收藏了。");
      if (fresh) router.replace(`/app/projects/${r.doc.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page-content projects-workspace">
      <Link className="back-link" href="/app/projects">
        <ArrowLeft size={16} />
        回到我的成长项目
      </Link>
      <div className="page-heading">
        <h1>{fresh ? "一个新的小计划" : "照顾我的小计划"}</h1>
        <p>不用很宏大，喜欢就可以开始。</p>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {ready && (
        <form className="settings-form" onSubmit={save}>
          <section className="settings-panel settings-form">
            <label>
              项目名称
              <input
                value={form.title}
                maxLength={100}
                required
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </label>
            <label>
              一句话介绍
              <input
                value={form.summary || ""}
                maxLength={240}
                onChange={(e) =>
                  setForm((f) => ({ ...f, summary: e.target.value }))
                }
              />
            </label>
            <label>
              这个小计划，从哪里开始
              <textarea
                maxLength={10000}
                value={form.description || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </label>
            <label>
              开始时间（选填）
              <input
                type="date"
                value={form.startedAt?.slice(0, 10) || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startedAt: e.target.value || null }))
                }
              />
            </label>
            <MediaPicker
              label="项目封面"
              value={typeof form.cover === "object" ? form.cover : null}
              onChange={(cover) => setForm((f) => ({ ...f, cover }))}
              hint="项目公开后，游客也可以查看封面。"
            />
            <label>
              现在走到哪里了
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as GrowthProject["status"],
                  }))
                }
              >
                <option value="exploring">正在探索</option>
                <option value="completed">已经完成</option>
              </select>
            </label>
            <label>
              谁可以看到这个项目
              <select
                value={form.visibility}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    visibility: e.target.value as GrowthProject["visibility"],
                  }))
                }
              >
                <option value="family">仅自己和家长可见</option>
                <option value="public">所有人可见（包括游客）</option>
              </select>
              <small>
                项目公开不会自动公开其中的私密记录；记录的可见范围分别选择。
              </small>
            </label>
          </section>
          {message && (
            <p className="success-message" role="status">
              {message}
            </p>
          )}
          <div className="settings-actions">
            <button className="primary-button" disabled={busy}>
              <Check size={17} />
              {busy ? "正在保存…" : "保存这个小计划"}
            </button>
            {!fresh && form.visibility === "public" && (
              <Link
                className="secondary-button"
                href={`/projects/${id}`}
                target="_blank"
              >
                <Globe2 size={17} />
                预览公开项目
              </Link>
            )}
          </div>
        </form>
      )}
      {!fresh && ready && (
        <section style={{ marginTop: 40 }}>
          <div className="section-heading">
            <h2>一路长出来的记忆</h2>
            <Link href={`/app/new?project=${id}`}>
              <Plus size={16} />
              记录项目进展
            </Link>
          </div>
          {entries.length ? (
            <div className="recent-grid">
              {entries.map((e) => (
                <EntryCard entry={e} privateEntry key={e.id} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="小计划的第一页，从现在开始。"
              description="在记录编辑器里关联这个项目，每一步尝试都会收在这里。"
              action={
                <Link
                  href={`/app/new?project=${id}`}
                  className="primary-button"
                >
                  <Plus size={16} />
                  记录一次进展
                </Link>
              }
            />
          )}
        </section>
      )}
    </main>
  );
}
