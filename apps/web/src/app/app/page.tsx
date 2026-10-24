"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Plus,
  BookOpen,
  Image,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import type { Entry } from "@mylife/shared";
import { displayDate, entryTitle, ENTRY_TYPES } from "@mylife/shared";
import { useSession } from "@/components/session";
import { api } from "@/lib/api";
import { draftKey, readDraft } from "@/lib/drafts";
export default function Dashboard() {
  const { user } = useSession();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [count, setCount] = useState(0);
  const [draft, setDraft] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ docs: Entry[]; totalDocs: number }>(
      "/entries?where[status][equals]=saved&sort=-updatedAt&limit=4&depth=1",
    )
      .then((r) => {
        setEntries(r.docs);
        setCount(r.totalDocs);
      })
      .catch((e) => setError(e.message));
    readDraft(draftKey(user))
      .then((d) => setDraft(Boolean(d)))
      .catch(() => {});
  }, [user]);
  return (
    <main className="page-content dashboard">
      <div className="page-heading">
        <span className="eyebrow">YOUR LITTLE BIG LIFE</span>
        <h1>
          嗨，{user.name} <span className="heading-star">✳</span>
        </h1>
        <p>今天，也有值得收藏的小事吗？</p>
      </div>
      <Link href="/app/new" className="new-entry-hero">
        <div>
          <span className="pill">只需一点点时间</span>
          <h2>给今天，留一个小小的注脚。</h2>
          <p>开心的、平常的、第一次做的，都可以。</p>
          <span className="hero-action">
            <Plus size={18} />
            记一件事
            <ArrowRight size={17} />
          </span>
        </div>
        <span className="hero-illustration" aria-hidden="true">
          <BookOpen size={88} strokeWidth={1} />
          <Sparkles size={33} />
        </span>
      </Link>
      {draft && (
        <Link href="/app/new" className="draft-banner">
          <BookOpen size={20} />
          <div>
            <strong>还有一个没讲完的小故事</strong>
            <span>此设备的草稿已经替你保存好了</span>
          </div>
          <ArrowRight size={18} />
        </Link>
      )}
      <div className="stats-row">
        <div>
          <BookOpen size={19} />
          <strong>{count}</strong>
          <span>段成长记忆</span>
        </div>
        <div>
          <CalendarDays size={19} />
          <strong>{new Date().getFullYear()}</strong>
          <span>正在收藏的这一年</span>
        </div>
      </div>
      <div className="section-heading">
        <h2>最近留下的记忆</h2>
        <Link href="/app/entries">
          去时间轴看看
          <ArrowRight size={15} />
        </Link>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {entries.length ? (
        <div className="recent-grid">
          {entries.map((e) => (
            <Link
              href={`/app/entries/${e.id}`}
              className="recent-card"
              key={e.id}
            >
              <span className="type-label">
                {ENTRY_TYPES.find((t) => t.value === e.type)?.label}
              </span>
              <h3>{entryTitle(e)}</h3>
              <p>{e.content.slice(0, 90)}</p>
              <small>{displayDate(e)}</small>
            </Link>
          ))}
        </div>
      ) : (
        !error && (
          <div className="empty-state">
            <Image size={34} strokeWidth={1.2} />
            <h3>第一段记忆，就从今天开始</h3>
            <p>
              无需准备好一个完整的故事，
              <br />
              写一句话、放一张照片就很好。
            </p>
            <Link className="text-button" href="/app/new">
              收藏我的第一刻
              <ArrowRight size={15} />
            </Link>
          </div>
        )
      )}
    </main>
  );
}
