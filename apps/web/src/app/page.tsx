import Link from "next/link";
import { ArrowRight, Sprout, LockKeyhole, BookOpen } from "lucide-react";
import { Brand } from "@/components/brand";
import { displayDate, entryTitle, type PublicEntry } from "@mylife/shared";
export default async function PublicHome() {
  let entries: PublicEntry[] = [];
  try {
    const r = await fetch(
      `${process.env.CMS_INTERNAL_URL || "http://127.0.0.1:3001"}/api/public/entries`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    if (r.ok) entries = (await r.json()).docs || [];
  } catch {}
  return (
    <main className="public-home">
      <header>
        <Brand href="/" />
        <Link href="/app" className="public-enter">
          进入我的空间
          <ArrowRight size={16} />
        </Link>
      </header>
      <section className="public-intro">
        <span className="eyebrow">A GROWING COLLECTION OF ME</span>
        <span className="public-sprout">
          <Sprout size={46} strokeWidth={1.2} />
        </span>
        <h1>
          慢慢长大，
          <br />
          慢慢成为自己。
        </h1>
        <p>
          关于探索、创造，和每一个小小的进步。
          <br />
          这些瞬间，组成了独一无二的成长故事。
        </p>
      </section>
      <section className="public-collection">
        <div className="section-heading">
          <h2>成长手记</h2>
          <span>THE LITTLE MOMENTS</span>
        </div>
        {entries.length ? (
          <div className="public-entries">
            {entries.map((e) => (
              <Link
                key={e.id}
                href={`/entries/${e.id}`}
                className="public-entry-link"
              >
                <article>
                  <BookOpen size={22} />
                  <time>{displayDate(e)}</time>
                  <h3>{entryTitle(e)}</h3>
                  <p>
                    {e.content.slice(0, 180)}
                    {e.content.length > 180 && "…"}
                  </p>
                  <span className="public-read-more">
                    阅读这段记忆 <ArrowRight size={14} />
                  </span>
                </article>
              </Link>
            ))}
          </div>
        ) : (
          <div className="public-empty">
            <span>✳</span>
            <h3>故事，正在慢慢生长。</h3>
            <p>等准备好了，再把喜欢的记忆分享给你。</p>
          </div>
        )}
      </section>
      <footer>
        <LockKeyhole size={13} />
        这里只展示选择公开的记忆，游客也可以查看。
        <span>my life, my story.</span>
      </footer>
    </main>
  );
}
