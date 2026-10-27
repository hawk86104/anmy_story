"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Plus,
  Search,
  LockKeyhole,
  Globe2,
  BookOpen,
  ChevronDown,
  LoaderCircle,
} from "lucide-react";
import {
  ENTRY_TYPES,
  entryTitle,
  displayDate,
  entryCover,
} from "@mylife/shared";
import type { Entry } from "@mylife/shared";
import { api } from "@/lib/api";
import { mediaUrl } from "@/lib/urls";
export default function Timeline() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("saved");
  const [visibility, setVisibility] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const p = new URLSearchParams({
      sort: "-occurredAt,-createdAt",
      depth: "1",
      limit: "20",
      page: String(page),
      "where[status][equals]": status,
    });
    if (type !== "all") p.set("where[type][equals]", type);
    if (visibility) p.set("where[visibility][equals]", visibility);
    if (search) {
      p.set("where[or][0][title][contains]", search);
      p.set("where[or][1][content][contains]", search);
    }
    api<{ docs: Entry[]; hasNextPage: boolean }>(`/entries?${p}`)
      .then((r) => {
        if (!active) return;
        setEntries((old) => (page === 1 ? r.docs : [...old, ...r.docs]));
        setHasMore(r.hasNextPage);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [type, search, page, status, visibility]);
  const groups = entries.reduce<Record<string, Entry[]>>((acc, e) => {
    const key =
      e.datePrecision === "unknown" || !e.occurredAt
        ? "待确认时间"
        : `${e.occurredAt.slice(0, 4)} 年`;
    (acc[key] ||= []).push(e);
    return acc;
  }, {});
  const ordered = Object.entries(groups).sort(([a], [b]) =>
    a === "待确认时间" ? 1 : b === "待确认时间" ? -1 : b.localeCompare(a),
  );
  return (
    <main className="page-content timeline-page">
      <div className="page-heading heading-with-action">
        <div>
          <span className="eyebrow">ONE MOMENT AT A TIME</span>
          <h1>
            成长，有迹可循<span className="heading-star">✳</span>
          </h1>
          <p>那些大大小小的瞬间，都在这里。</p>
        </div>
        <Link className="primary-button" href="/app/new">
          <Plus size={17} />
          记一件事
        </Link>
      </div>
      <div className="timeline-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="搜索记录"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="找找某一段记忆…"
          />
        </div>
        <label className="status-select">
          <select
            aria-label="保存状态"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="saved">已收藏的记忆</option>
            <option value="draft">家庭空间的草稿</option>
            <option value="archived">已归档的记忆</option>
          </select>
          <ChevronDown size={15} />
        </label>
        <label className="status-select">
          <select
            aria-label="可见范围"
            value={visibility}
            onChange={(e) => {
              setVisibility(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部可见范围</option>
            <option value="family">仅自己和家长可见</option>
            <option value="public">所有人可见</option>
          </select>
          <ChevronDown size={15} />
        </label>
      </div>
      <div className="filter-pills">
        <button
          className={type === "all" ? "selected" : ""}
          onClick={() => {
            setType("all");
            setPage(1);
          }}
        >
          全部记忆
        </button>
        {ENTRY_TYPES.map((t) => (
          <button
            key={t.value}
            className={type === t.value ? "selected" : ""}
            onClick={() => {
              setType(t.value);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {loading && page === 1 ? (
        <div className="empty-state">
          <LoaderCircle className="spin" />
          <p>正在翻开成长手记…</p>
        </div>
      ) : entries.length ? (
        <div className="timeline-groups">
          {ordered.map(([year, group]) => (
            <section className="timeline-year" key={year}>
              <h2>
                {year}
                <span>{group.length} 段记忆</span>
              </h2>
              <div className="timeline-track">
                {group.map((e) => {
                  const photo = entryCover(e);
                  return (
                    <Link
                      href={`/app/entries/${e.id}`}
                      className="timeline-entry"
                      key={e.id}
                    >
                      <span className="timeline-dot" />
                      <div className="timeline-entry-info">
                        <span className="timeline-date">
                          {displayDate(e)}
                          {e.retrospective && <small>回忆补录</small>}
                        </span>
                        <h3>{entryTitle(e)}</h3>
                        <p>{e.content.slice(0, 140)}</p>
                        <div className="entry-chips">
                          <span>
                            {ENTRY_TYPES.find((t) => t.value === e.type)?.label}
                          </span>
                          <span>
                            {e.visibility === "public" ? (
                              <Globe2 size={12} />
                            ) : (
                              <LockKeyhole size={12} />
                            )}
                            {e.visibility === "public"
                              ? "所有人可见"
                              : "仅自己和家长可见"}
                          </span>
                          {e.tags?.slice(0, 2).map((t) => (
                            <span key={t.label}>#{t.label}</span>
                          ))}
                        </div>
                      </div>
                      {photo && typeof photo !== "number" && (
                        <img
                          className="timeline-thumbnail"
                          src={mediaUrl(photo.url)}
                          crossOrigin="use-credentials"
                          alt={photo.alt || "记录照片"}
                          loading="lazy"
                        />
                      )}
                      <ArrowRight size={18} className="timeline-arrow" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        !error && (
          <div className="empty-state">
            <BookOpen size={38} strokeWidth={1.2} />
            <h3>
              {search || type !== "all"
                ? "还没找到这段记忆"
                : status === "draft"
                  ? "这里暂时没有草稿"
                  : "这本成长手记，等你落下第一笔"}
            </h3>
            <p>
              {search || type !== "all"
                ? "试试换个词，或者看看其他记录方式。"
                : status === "draft"
                  ? "编辑器里的设备草稿，打开“记一件事”就会自动接上。"
                  : "现在的一句随手记，会成为未来珍贵的回忆。"}
            </p>
            <Link className="text-button" href="/app/new">
              去记一件小事
              <ArrowRight size={15} />
            </Link>
          </div>
        )
      )}
      {hasMore && (
        <button
          className="load-more"
          disabled={loading}
          onClick={() => setPage((p) => p + 1)}
        >
          {loading ? "正在翻页…" : "再往前翻翻"}
          <ChevronDown size={16} />
        </button>
      )}
    </main>
  );
}
