import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Globe2 } from "lucide-react";
import {
  ENTRY_TYPES,
  displayDate,
  entryTitle,
  type PublicEntry,
} from "@mylife/shared";
import { Brand } from "@/components/brand";
import { MediaView } from "@/components/media-view";

export default async function PublicEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await fetch(
    `${process.env.CMS_INTERNAL_URL || "http://127.0.0.1:3001"}/api/public/entries/${encodeURIComponent(id)}`,
    { cache: "no-store", signal: AbortSignal.timeout(5000) },
  );
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("暂时无法读取这段记忆，请稍后重试。");
  const entry: PublicEntry = await response.json();
  return (
    <main className="public-home">
      <header>
        <Brand href="/" />
        <Link href="/app" className="public-enter">
          进入我的空间 <ArrowRight size={16} />
        </Link>
      </header>
      <section className="public-detail">
        <Link className="back-link" href="/">
          <ArrowLeft size={16} /> 返回成长手记
        </Link>
        <article className="detail-card">
          <div className="detail-topline">
            <span className="type-label">
              {ENTRY_TYPES.find((type) => type.value === entry.type)?.label}
            </span>
            <span className="detail-date">
              {displayDate(entry)}
              {entry.retrospective && " · 回忆补录"}
            </span>
          </div>
          <h1>{entryTitle(entry)}</h1>
          <div className="detail-byline">
            <Globe2 size={14} /> 所有人可见
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
            {entry.media.map((media) => (
              <MediaView key={media.id} media={media} />
            ))}
          </div>
          {Boolean(entry.tags?.length) && (
            <div className="detail-tags">
              {entry.tags?.map((tag) => (
                <span className="tag" key={tag.label}>
                  #{tag.label}
                </span>
              ))}
            </div>
          )}
        </article>
      </section>
      <footer>
        <Globe2 size={13} /> 公开的记忆，无需登录也能阅读。
        <span>my life, my story.</span>
      </footer>
    </main>
  );
}
