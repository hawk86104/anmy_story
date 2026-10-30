"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Plus,
  BookOpen,
  CalendarDays,
  Sparkles,
  Palette,
  Flag,
  UserRound,
  FolderHeart,
  FilePenLine,
} from "lucide-react";
import { ENTRY_LIST_SORT, ENTRY_TYPES, type Entry } from "@mylife/shared";
import { useSession } from "@/components/session";
import { api } from "@/lib/api";
import { draftKey, readDraft } from "@/lib/drafts";
import { EmptyState, ThemeMascot } from "@/components/theme";
import { EntryCard } from "@/components/entry-card";
export default function Dashboard() {
  const { user } = useSession();
  const [entries, setEntries] = useState<Entry[]>([]),
    [count, setCount] = useState(0),
    [draft, setDraft] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ docs: Entry[]; totalDocs: number }>(
      `/entries?where[status][equals]=saved&sort=${ENTRY_LIST_SORT}&limit=4&depth=1`,
    )
      .then((r) => {
        if (active) {
          setEntries(r.docs);
          setCount(r.totalDocs);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    readDraft(draftKey(user))
      .then((d) => {
        if (active) setDraft(Boolean(d));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user.id]);
  const icons = {
    quick: Sparkles,
    story: BookOpen,
    work: Palette,
    honor: Flag,
  };
  return (
    <main className="page-content dashboard">
      <div className="page-heading">
        <span className="site-tag sage">只属于你和家人的小世界</span>
        <h1 style={{ marginTop: 24 }}>嗨，{user.name}</h1>
        <p>今天，也有值得收藏的小事吗？</p>
      </div>
      <Link href="/app/new" className="new-entry-hero">
        <div>
          <h2>
            给今天，
            <br />
            留个小小的注脚。
          </h2>
          <p>开心的、平常的、第一次做的，都可以。</p>
          <span className="hero-action">
            记一件事
            <Plus size={18} />
          </span>
        </div>
        <ThemeMascot size={190} />
      </Link>
      <div className="entry-modes">
        {ENTRY_TYPES.map((t) => {
          const Icon = icons[t.value];
          return (
            <Link href={`/app/new?type=${t.value}`} key={t.value}>
              <Icon size={25} />
              {t.label}
            </Link>
          );
        })}
      </div>
      {draft && (
        <Link href="/app/new" className="draft-banner">
          <BookOpen size={22} />
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
          <span>正在收藏</span>
        </div>
      </div>
      <div className="app-shortcuts">
        <Link className="secondary-button" href="/app/drafts">
          <FilePenLine size={16} />
          我的草稿
        </Link>
        <Link className="secondary-button" href="/app/projects">
          <FolderHeart size={16} />
          我的小计划
        </Link>
        <Link className="secondary-button" href="/app/profile">
          <UserRound size={16} />
          我的资料与主页
        </Link>
      </div>
      <div className="section-heading">
        <h2>最近留下的记忆</h2>
        <Link href="/app/entries">
          去时间轴看看
          <ArrowRight size={15} />
        </Link>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {entries.length ? (
        <div className="recent-grid">
          {entries.map((e) => (
            <EntryCard entry={e} privateEntry key={e.id} />
          ))}
        </div>
      ) : (
        !error && (
          <EmptyState
            title="第一段记忆，就从今天开始"
            description="无需准备好一个完整的故事，写一句话、放一张照片就很好。"
            action={
              <Link className="primary-button" href="/app/new">
                <Plus size={17} />
                收藏我的第一刻
              </Link>
            }
          />
        )
      )}
    </main>
  );
}
