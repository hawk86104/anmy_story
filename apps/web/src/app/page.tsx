import Link from "next/link";
import { ArrowRight, Sprout, LockKeyhole, BookOpen } from "lucide-react";
import { Brand } from "@/components/brand";
interface PublicEntry {
  id: number;
  title?: string;
  type: string;
  content: string;
  occurredAt?: string;
  datePrecision: string;
}
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
              <article key={e.id}>
                <BookOpen size={22} />
                <time>
                  {e.datePrecision === "year"
                    ? e.occurredAt?.slice(0, 4)
                    : e.datePrecision === "month"
                      ? e.occurredAt?.slice(0, 7)
                      : e.occurredAt?.slice(0, 10) || "一段珍贵的记忆"}
                </time>
                <h3>{e.title || e.content.slice(0, 32) || "一段成长记录"}</h3>
                <p>{e.content}</p>
              </article>
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
        这里只展示获准公开的记忆。<span>my life, my story.</span>
      </footer>
    </main>
  );
}
