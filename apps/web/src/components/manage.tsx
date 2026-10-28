"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  BookOpen,
  Check,
  Download,
  FileUp,
  FolderHeart,
  History,
  Image,
  LayoutGrid,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import type { Entry, Media, Member } from "@mylife/shared";
import { displayDate } from "@mylife/shared";
import { markdownEntryTitle as entryTitle } from "@/lib/markdown-text";
import { api, sizeLabel } from "@/lib/api";
import { apiUrl, mediaUrl } from "@/lib/urls";
import { prepareImage, uploadMedia } from "@/lib/media";
import { useSession } from "./session";
import { draftKey, removeDraft } from "@/lib/drafts";
import { EntryArtwork } from "./entry-card";
import { EntryEditor } from "./entry-editor";
import { MarkdownContent } from "./markdown-content";
import { EmptyState } from "./theme";
import { FamilyDataManagement } from "./family-data-management";

const links = [
  { href: "/app/manage", label: "概览", icon: LayoutGrid },
  { href: "/app/manage/entries", label: "记录", icon: BookOpen },
  { href: "/app/manage/media", label: "素材", icon: Image },
  { href: "/app/manage/import", label: "导入", icon: FileUp },
  { href: "/app/manage/members", label: "成员", icon: Users },
  { href: "/app/manage/themes", label: "主题", icon: Palette },
  { href: "/app/manage/settings", label: "设置", icon: Settings },
];
export function ManageShell({ children }: { children: React.ReactNode }) {
  const { user } = useSession(),
    path = usePathname();
  if (user.role !== "parent")
    return (
      <main className="page-content">
        <EmptyState
          title="这里由家长一起照顾。"
          description="使用家长账号，才能管理家庭成员、素材和服务设置。"
          action={
            <Link className="primary-button" href="/app">
              回到我的成长空间
            </Link>
          }
        />
      </main>
    );
  const title = path.startsWith("/app/manage/entries/")
    ? "编辑家庭记录"
    : path === "/app/manage/ai"
      ? "AI 与长期保存"
      : links.find((l) => l.href === path)?.label || "家长后台";
  return (
    <main className="page-content manage-page">
      <Link className="back-link" href="/app">
        <ArrowLeft size={16} />
        我的成长空间
      </Link>
      <div className="manage-heading">
        <div>
          <span className="eyebrow">GROWING TOGETHER</span>
          <h1>
            {path === "/app/manage"
              ? "一起，照顾成长的记忆。"
              : title === "概览"
                ? "家长后台"
                : title}
          </h1>
          <p>陪伴孩子表达，也保护最初的样子。</p>
        </div>
      </div>
      <nav className="manage-nav" aria-label="家长管理导航">
        {links.map((l) => (
          <Link
            key={l.href}
            className={path === l.href ? "active" : ""}
            href={l.href}
          >
            <l.icon size={16} />
            {l.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
export function ManageLink({
  href,
  title,
  note,
  icon: Icon,
}: {
  href: string;
  title: string;
  note: string;
  icon: typeof BookOpen;
}) {
  return (
    <Link className="manage-link" href={href}>
      <span className="icon-tile">
        <Icon size={22} />
      </span>
      <div>
        <strong>{title}</strong>
        <small>{note}</small>
      </div>
      <ArrowRight size={18} />
    </Link>
  );
}
export function ManageOverview() {
  const [stats, setStats] = useState({
      records: 0,
      media: 0,
      drafts: 0,
      processing: 0,
    }),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<typeof stats>("/family/overview")
      .then((r) => {
        if (active) setStats(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <div className="stats-row">
        <div>
          <BookOpen size={20} />
          <strong>{stats.records}</strong>
          <span>条家庭记录</span>
        </div>
        <div>
          <Image size={20} />
          <strong>{stats.media}</strong>
          <span>份家庭素材</span>
        </div>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {stats.processing > 0 && (
        <div className="settings-panel" style={{ background: "var(--soft)" }}>
          <h2>
            <Video size={21} /> {stats.processing} 个视频正在处理
          </h2>
          <p>记录已经保存，完成后会自动替换为兼容视频。</p>
        </div>
      )}
      <div className="manage-links">
        <ManageLink
          href="/app/manage/entries"
          icon={BookOpen}
          title="管理成长记录"
          note={`${stats.drafts} 份家庭草稿 · 修改、归档与查看版本`}
        />
        <ManageLink
          href="/app/manage/media"
          icon={Image}
          title="整理家庭素材"
          note="检查引用与视频处理状态"
        />
        <ManageLink
          href="/app/manage/members"
          icon={Users}
          title="家庭成员"
          note="孩子和家长，使用各自的账号"
        />
        <ManageLink
          href="/app/manage/import"
          icon={FileUp}
          title="导入以前的文字资料"
          note="CSV / JSON 预览、识别重复，再收进家庭空间"
        />
        <ManageLink
          href="/app/manage/themes"
          icon={Palette}
          title="主页与主题"
          note="乌萨奇、小八与吉伊的三套色彩"
        />
        <ManageLink
          href="/app/projects"
          icon={FolderHeart}
          title="一起维护成长项目"
          note="把相关的记忆串成一个小计划"
        />
        <ManageLink
          href="/app/manage/ai"
          icon={Sparkles}
          title="AI 与长期保存"
          note="家长配置、明确授权、导出与备份"
        />
      </div>
    </>
  );
}
export function ManageEntries() {
  const [rows, setRows] = useState<Entry[]>([]),
    [status, setStatus] = useState("saved"),
    [visibility, setVisibility] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    const p = new URLSearchParams({
      depth: "1",
      limit: "20",
      page: String(page),
      sort: "-updatedAt",
      "where[status][equals]": status,
    });
    if (visibility) p.set("where[visibility][equals]", visibility);
    if (search) {
      p.set("where[or][0][title][contains]", search);
      p.set("where[or][1][content][contains]", search);
    }
    try {
      const r = await api<{ docs: Entry[]; hasNextPage: boolean }>(
        `/entries?${p}`,
      );
      setRows((old) => (page === 1 ? r.docs : [...old, ...r.docs]));
      setMore(r.hasNextPage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [page, status, visibility, search]);
  useEffect(() => {
    void load();
  }, [load]);
  async function archive(e: Entry) {
    if (
      !confirm(
        "归档后这条记录会改为家庭可见，之后仍可在归档列表里查看。确定归档吗？",
      )
    )
      return;
    try {
      await api(`/entries/${e.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "archived",
          visibility: "family",
          revision: e.revision,
        }),
      });
      setRows((list) => list.filter((r) => r.id !== e.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="site-filters">
        <label className="site-search">
          <Search size={18} />
          <input
            aria-label="搜索家庭记录"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题或内容"
          />
        </label>
        <select
          aria-label="记录状态"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="saved">已保存</option>
          <option value="draft">家庭草稿</option>
          <option value="archived">已归档</option>
        </select>
        <select
          aria-label="可见范围"
          value={visibility}
          onChange={(e) => {
            setVisibility(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部可见范围</option>
          <option value="public">公开</option>
          <option value="family">仅家庭可见</option>
        </select>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="manage-links">
        {rows.map((e) => (
          <article className="manage-record" key={e.id}>
            <div style={{ width: 80, flexShrink: 0 }}>
              <EntryArtwork entry={e} />
            </div>
            <div className="manage-record-content">
              <span
                className={`site-tag ${e.visibility === "public" ? "sky" : "sage"}`}
              >
                {e.status === "draft"
                  ? "草稿"
                  : e.status === "archived"
                    ? "归档"
                    : e.visibility === "public"
                      ? "公开"
                      : "私密"}
              </span>
              <h2>{entryTitle(e)}</h2>
              <p>
                {displayDate(e)} · 最近修改：{e.editorName || "家庭成员"}
              </p>
            </div>
            <div className="settings-actions">
              <Link
                className="text-button"
                href={`/app/manage/entries/${e.id}`}
              >
                <History size={15} />
                编辑与版本
              </Link>
              <Link className="text-button" href={`/app/entries/${e.id}`}>
                <ArrowRight size={15} />
                阅读记录
              </Link>
              {e.status !== "archived" && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => void archive(e)}
                >
                  <Archive size={15} />
                  归档
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!busy && !rows.length && !error && (
        <EmptyState
          title="这里暂时没有这一类记录。"
          description="换个筛选，或者一起收藏新的小故事。"
        />
      )}
      {busy && <p className="muted">正在翻开家庭记忆…</p>}
      {more && (
        <button
          className="load-more"
          disabled={busy}
          onClick={() => setPage((p) => p + 1)}
        >
          继续翻页
        </button>
      )}
    </>
  );
}
export function ManageRecord({ id }: { id: string }) {
  const { user } = useSession();
  const [entry, setEntry] = useState<Entry | null>(null),
    [tab, setTab] = useState("edit"),
    [history, setHistory] = useState<
      {
        id: number;
        revision: number;
        editorName: string;
        createdAt: string;
        snapshot: Entry;
      }[]
    >([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const load = useCallback(
    () =>
      api<Entry>(`/entries/${encodeURIComponent(id)}?depth=1`)
        .then(setEntry)
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (tab !== "history") return;
    let active = true;
    api<{ docs: typeof history }>(
      `/entry-history?where[entry][equals]=${encodeURIComponent(id)}&sort=-revision&limit=100`,
    )
      .then(async (r) => {
        if (!active) return;
        if (r.docs.length) {
          setHistory(r.docs);
          return;
        }
        const old = await api<{
          docs: { id: number; version: Entry; createdAt: string }[];
        }>(
          `/entries/versions?where[parent][equals]=${encodeURIComponent(id)}&sort=-createdAt&limit=100`,
        );
        if (active)
          setHistory(
            old.docs.map((v) => ({
              id: v.id,
              revision: v.version.revision,
              editorName: v.version.editorName || "家庭成员",
              createdAt: v.createdAt,
              snapshot: v.version,
            })),
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [tab, id]);
  return (
    <>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      <div className="site-filter-links">
        <button
          className={
            tab === "edit" ? "secondary-button selected" : "secondary-button"
          }
          onClick={() => setTab("edit")}
        >
          内容编辑
        </button>
        <button
          className={
            tab === "history" ? "secondary-button selected" : "secondary-button"
          }
          onClick={() => setTab("history")}
        >
          版本历史
        </button>
      </div>
      {entry &&
        (tab === "edit" ? (
          <EntryEditor
            key={`${entry.id}-${entry.revision}`}
            entry={entry}
            embedded
            onSaved={() => {
              setMessage("这次修改已保存，最初的表达仍然保留。");
              void load();
            }}
          />
        ) : (
          <section className="settings-panel">
            <h2>最初的表达，仍然在这里。</h2>
            <MarkdownContent className="version-comparison" content={entry.originalText || "这段记录最初以素材开始。"} />
            <h2>一路写来的样子</h2>
            {history.map((v) => (
              <details className="history-item" key={v.id}>
                <summary>
                  版本 {v.revision} · {v.editorName}{" "}
                  <small>{new Date(v.createdAt).toLocaleString("zh-CN")}</small>
                </summary>
                <MarkdownContent className="version-comparison" content={v.snapshot.content || "这一版记录以素材开始。"} />
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await removeDraft(draftKey(user, entry.id));
                      setEntry({
                        ...entry,
                        title: v.snapshot.title,
                        content: v.snapshot.content,
                        reflection: v.snapshot.reflection,
                        learning: v.snapshot.learning,
                      });
                      setTab("edit");
                      setMessage(
                        "这版文字已放入编辑器。确认后保存，会形成一个新版本。",
                      );
                    } catch {
                      setError(
                        "暂时无法替换设备草稿，请先保留当前草稿后再试。",
                      );
                    }
                  }}
                >
                  用这版正文继续编辑
                  <ArrowRight size={15} />
                </button>
              </details>
            ))}
            {!history.length && (
              <p className="muted">
                正在读取版本，或这条记录暂时没有历史版本。
              </p>
            )}
            <p className="muted">
              此处显示最近 100 个版本；完整的可用长期版本可随家庭档案导出。
            </p>
          </section>
        ))}
    </>
  );
}
export function ManageMedia() {
  const [rows, setRows] = useState<Media[]>([]),
    [kind, setKind] = useState(""),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ docs: Media[]; hasNextPage: boolean }>(
        `/family/media?kind=${kind}&page=${page}&q=${encodeURIComponent(search)}`,
      );
      setRows((old) => (page === 1 ? r.docs : [...old, ...r.docs]));
      setMore(r.hasNextPage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [kind, page, search]);
  useEffect(() => {
    void load();
  }, [load]);
  async function remove(m: Media) {
    if (
      !confirm(
        `删除闲置素材“${m.alt || m.filename}”？文件会被清理，已有备份不受影响。`,
      )
    )
      return;
    try {
      await api(`/media/${m.id}`, { method: "DELETE" });
      setRows((list) => list.filter((x) => x.id !== m.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function retry(m: Media) {
    try {
      await api(`/media/${m.id}/retry`, { method: "POST" });
      setRows((list) =>
        list.map((x) =>
          x.id === m.id ? { ...x, processingStatus: "queued" } : x,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    setProgress(0);
    try {
      const optimized = await prepareImage(file, false);
      await uploadMedia(optimized, file.size, "photo", setProgress);
      if (page === 1) await load();
      else setPage(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <div className="site-filters">
        <label className="site-search">
          <Search size={18} />
          <input
            aria-label="搜索家庭素材"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索素材名称"
          />
        </label>
        <select
          aria-label="素材类型"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部素材</option>
          <option value="image">照片</option>
          <option value="video">视频</option>
          <option value="audio">声音</option>
        </select>
      </div>
      <div className="notice-banner">
        <ShieldCheck size={20} />
        正在被记录、主页或项目使用的素材会保留；闲置素材可确认后删除。
      </div>
      <label className="primary-button" style={{ marginBottom: 24 }}>
        <Plus size={18} />
        {uploading ? `上传中 ${progress}%` : "上传家庭素材"}
        <input
          hidden
          disabled={uploading}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/*,application/pdf"
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="manage-media-grid">
        {rows.map((m) => (
          <article className="manage-media-item" key={m.id}>
            {m.mimeType?.startsWith("image/") ? (
              <img
                className="entry-artwork"
                src={mediaUrl(m.url)}
                alt={m.alt || m.filename}
                loading="lazy"
              />
            ) : (
              <div className="entry-artwork entry-artwork-fallback">
                {m.mimeType?.startsWith("video/") ? (
                  <Video size={38} />
                ) : (
                  <Image size={38} />
                )}
                <span>
                  {m.mimeType?.startsWith("audio/")
                    ? "一段声音"
                    : m.mimeType?.startsWith("video/")
                      ? "一段视频"
                      : "一份文件"}
                </span>
              </div>
            )}
            <h2>{m.alt || m.filename}</h2>
            <span
              className={`site-tag ${m.referenceCount ? "sage" : m.processingStatus === "failed" ? "pink" : ""}`}
            >
              {m.referenceCount
                ? `被 ${m.referenceCount} 处使用`
                : m.processingStatus === "failed"
                  ? "处理失败"
                  : ["queued", "processing"].includes(m.processingStatus)
                    ? "正在处理"
                    : "闲置素材"}
            </span>
            <p>
              {sizeLabel(m.filesize)} ·{" "}
              {m.processingStatus === "ready"
                ? "已就绪"
                : m.processingStatus === "failed"
                  ? "原件仍保留"
                  : "视频整理中"}
            </p>
            <div className="settings-actions">
              <a
                className="text-button"
                href={mediaUrl(m.url)}
                target="_blank"
                rel="noreferrer"
              >
                查看 <ArrowRight size={14} />
              </a>
              {m.processingStatus === "failed" && (
                <button className="text-button" onClick={() => void retry(m)}>
                  <RefreshCw size={14} />
                  重试
                </button>
              )}
              <button
                className="text-button"
                disabled={
                  !!m.referenceCount ||
                  ["queued", "processing"].includes(m.processingStatus)
                }
                onClick={() => void remove(m)}
              >
                <Trash2 size={14} />
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
      {busy && <p className="muted">正在整理素材列表…</p>}
      {!busy && !rows.length && !error && (
        <EmptyState
          title="这里暂时没有这类素材。"
          description="上传的照片、声音与作品附件，会一起收在家庭空间里。"
        />
      )}
      {more && (
        <button
          className="load-more"
          disabled={busy}
          onClick={() => setPage((p) => p + 1)}
        >
          加载更多素材
        </button>
      )}
    </>
  );
}

export function ManageMembers() {
  const { user } = useSession();
  const [members, setMembers] = useState<Member[]>([]),
    [editing, setEditing] = useState<Member | null>(null),
    [open, setOpen] = useState(false),
    [form, setForm] = useState({
      name: "",
      email: "",
      password: "",
      role: "parent",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const load = useCallback(
    () =>
      api<{ docs: Member[] }>("/users?depth=0&limit=100&sort=createdAt")
        .then((r) => setMembers(r.docs))
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  function edit(m: Member | null) {
    setEditing(m);
    setForm({
      name: m?.name || "",
      email: m?.email || "",
      password: "",
      role: m?.role || "parent",
    });
    setError("");
    setMessage("");
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        ...(form.password ? { password: form.password } : {}),
      };
      await api(editing ? `/users/${editing.id}` : "/users", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(data),
      });
      setOpen(false);
      setForm((f) => ({ ...f, password: "" }));
      setMessage(
        editing
          ? "成员资料已保存。"
          : "新的家庭成员已添加，可以使用自己的账号登录。",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="settings-panel" style={{ background: "var(--soft)" }}>
        <h2>
          <Users size={23} />
          一起收藏，一起守护。
        </h2>
        <p>孩子记录自己的故事，家长陪伴维护家庭空间。</p>
      </section>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      <div className="manage-links">
        {members.map((m) => (
          <button
            className="manage-link"
            style={{ textAlign: "left" }}
            key={m.id}
            onClick={() => edit(m)}
          >
            <span className="avatar">{m.name.slice(0, 1)}</span>
            <div>
              <strong>
                {m.name}
                {m.id === user.id ? " · 当前登录" : ""}
              </strong>
              <small>
                {m.role === "parent"
                  ? "家长账号 · 一起维护"
                  : "孩子账号 · 记录自己的成长"}
              </small>
            </div>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
      <button
        className="primary-button"
        style={{ marginTop: 24 }}
        onClick={() => edit(null)}
      >
        <Plus size={17} />
        添加家庭成员
      </button>
      {open && (
        <form
          className="settings-panel settings-form"
          onSubmit={save}
          style={{ marginTop: 24 }}
        >
          <h2>{editing ? "维护成员资料" : "添加家庭成员"}</h2>
          <label>
            称呼
            <input
              value={form.name}
              maxLength={60}
              required
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label>
            登录邮箱
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </label>
          <label>
            {editing ? "新密码（留空保持原密码）" : "登录密码"}
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              required={!editing}
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
            />
            <small>至少 12 位，使用与其他成员不同的密码。</small>
          </label>
          <label>
            家庭角色
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="child">孩子</option>
              <option value="parent">家长</option>
            </select>
          </label>
          <div className="settings-actions">
            <button className="primary-button" disabled={busy}>
              <Check size={17} />
              {busy ? "正在保存…" : "保存成员"}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setOpen(false);
                setForm((f) => ({ ...f, password: "" }));
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}
    </>
  );
}
export function ManageSettings() {
  return (
    <>
      <div className="manage-links">
        <ManageLink
          href="/app/profile"
          icon={Users}
          title="公开资料与头像封面"
          note="自己的简介、兴趣与主页照片"
        />
        <ManageLink
          href="/app/manage/themes"
          icon={Palette}
          title="主题与主页模块"
          note="选择喜欢的色彩与公开展示入口"
        />
        <ManageLink
          href="/app/manage/members"
          icon={Users}
          title="家庭成员"
          note="独立账号，家长与孩子各有分工"
        />
        <ManageLink
          href="/app/manage/ai"
          icon={Sparkles}
          title="AI 与长期保存"
          note="配置服务、查看授权、导出家庭档案"
        />
      </div>
      <FamilyDataManagement />
    </>
  );
}
