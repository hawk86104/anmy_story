import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Flower2,
  Globe2,
  Search,
} from "lucide-react";
import {
  ENTRY_TYPES,
  displayDate,
  entryTitle,
  entryCover,
  type GrowthProject,
  type PublicEntry,
} from "@mylife/shared";
import {
  publicApi,
  publicProfile,
  emptyPage,
  type PageData,
} from "@/lib/public-data";
import { mediaUrl } from "@/lib/urls";
import { SiteShell } from "./site-shell";
import { EmptyState, Usagi, themeAssets } from "./theme";
import { EntryArtwork, EntryCard } from "./entry-card";
import { MediaView } from "./media-view";

type Query = Record<string, string | string[] | undefined>;
const str = (q: Query, key: string) =>
  typeof q[key] === "string" ? (q[key] as string) : "";
export function PageHero({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="site-mini-hero">
      <div>
        <span className="eyebrow">MY LITTLE WORLD</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <Usagi />
    </section>
  );
}
function Pagination({
  data,
  route,
  query,
}: {
  data: PageData<unknown>;
  route: string;
  query: Query;
}) {
  if (data.totalPages < 2) return null;
  const href = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(query))
      if (typeof v === "string" && k !== "page") p.set(k, v);
    p.set("page", String(page));
    return `${route}?${p}`;
  };
  return (
    <nav className="site-pagination" aria-label="翻页">
      {data.page > 1 && (
        <Link className="secondary-button" href={href(data.page - 1)}>
          <ArrowLeft size={16} />
          上一页
        </Link>
      )}
      <span>
        第 {data.page} / {data.totalPages} 页
      </span>
      {data.hasNextPage && (
        <Link className="secondary-button" href={href(data.page + 1)}>
          再往前翻翻 <ArrowRight size={16} />
        </Link>
      )}
    </nav>
  );
}
export async function PublicHome() {
  const profile = await publicProfile();
  let error = "";
  const records = await publicApi<PageData<PublicEntry>>(
    "/entries?limit=3",
  ).catch((e) => {
    error = e.message;
    return emptyPage<PublicEntry>();
  });
  return (
    <SiteShell profile={profile}>
      <main className="site-main site-home">
        <section
          className={`site-home-hero ${profile.cover ? "custom-cover" : ""}`}
        >
          <img
            className="site-hero-picture"
            src={
              profile.cover ? mediaUrl(profile.cover.url) : themeAssets.banner
            }
            crossOrigin={profile.cover ? "use-credentials" : undefined}
            alt={profile.cover?.alt || "乌萨奇和朋友们的阳光草地"}
            fetchPriority="high"
          />
          <div className="site-hero-copy">
            <span className="site-tag">和乌萨奇一起，收藏小日子</span>
            <h1>
              慢慢长大，
              <br />
              也要闪闪发光。
            </h1>
            <p>
              关于探索、创造，和每个小小的进步。
              <br />
              把喜欢的日子，一页一页收藏起来。
            </p>
            <Link
              className="primary-button"
              href={
                profile.modules.timeline
                  ? "/timeline"
                  : profile.modules.works
                    ? "/works"
                    : profile.modules.honors
                      ? "/honors"
                      : profile.modules.projects
                        ? "/projects"
                        : "#memories"
              }
            >
              翻开我的成长手记 <ArrowRight size={17} />
            </Link>
          </div>
        </section>
        <section className="site-profile">
          <div className="site-avatar">
            {profile.avatar ? (
              <img src={mediaUrl(profile.avatar.url)} alt="公开头像" />
            ) : (
              <Usagi size={76} />
            )}
          </div>
          <div className="site-profile-copy">
            <h2>{profile.displayName}</h2>
            <p>{profile.bio}</p>
            <div>
              {profile.interests.map((i) => (
                <span className="site-tag sage" key={i.label}>
                  {i.label}
                </span>
              ))}
            </div>
          </div>
          <div className="site-profile-stats">
            {[
              [profile.stats?.entries || 0, "段公开记忆"],
              [profile.stats?.works || 0, "件小小作品"],
              [profile.stats?.honors || 0, "个小里程碑"],
            ].map(([n, label]) => (
              <div key={label}>
                <strong>{n}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="site-collection" id="memories">
          <div className="site-section-heading">
            <div>
              <h2>最近的小美好</h2>
              <span>THE LITTLE MOMENTS</span>
            </div>
            {profile.modules.timeline && (
              <Link href="/timeline">
                全部成长记忆 <ArrowRight size={15} />
              </Link>
            )}
          </div>
          {error ? (
            <div className="error-box" role="alert">
              {error}
            </div>
          ) : records.docs.length ? (
            <div className="memory-grid">
              {records.docs.map((e) => (
                <EntryCard entry={e} key={e.id} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="故事，正在慢慢生长。"
              description="等准备好了，再把喜欢的记忆分享给你。"
            />
          )}
        </section>
        {profile.modules.timeline && (
          <section className="site-note-banner">
            <Flower2 size={42} />
            <div>
              <h2>每个平常的今天，都在悄悄发光。</h2>
              <p>沿着成长时间轴，看看一路走来的小脚印。</p>
            </div>
            <Link className="secondary-button" href="/timeline">
              沿着时间轴走走 <ArrowRight size={17} />
            </Link>
          </section>
        )}
      </main>
    </SiteShell>
  );
}

export async function PublicCollection({
  mode,
  query,
}: {
  mode: "timeline" | "works" | "honors";
  query: Query;
}) {
  const profile = await publicProfile();
  if (!profile.modules[mode]) notFound();
  const info = {
    timeline: [
      "成长的每一步，都值得留下。",
      "把小小的瞬间，连成属于自己的故事。",
      "",
    ],
    works: [
      "我的小小创造，今天也开张。",
      "画出来、做出来，让天马行空有自己的形状。",
      "work",
    ],
    honors: [
      "第一次也好，小进步也好。",
      "每一个勇敢尝试的我，都值得被好好记住。",
      "honor",
    ],
  }[mode];
  const p = new URLSearchParams({
    limit: "18",
    page: str(query, "page") || "1",
  });
  const type = info[2] || str(query, "type");
  if (type) p.set("type", type);
  if (str(query, "q")) p.set("q", str(query, "q"));
  if (str(query, "year")) p.set("year", str(query, "year"));
  let error = "";
  const data = await publicApi<PageData<PublicEntry>>(`/entries?${p}`).catch(
    (e) => {
      error = e.message;
      return emptyPage<PublicEntry>();
    },
  );
  const route = `/${mode}`;
  const groups = data.docs.reduce<Record<string, PublicEntry[]>>((all, e) => {
    const y =
      e.datePrecision === "unknown" || !e.occurredAt
        ? "时间待确认"
        : `${e.occurredAt.slice(0, 4)} 年`;
    (all[y] ||= []).push(e);
    return all;
  }, {});
  return (
    <SiteShell profile={profile}>
      <main className={`site-main site-list-page site-${mode}`}>
        <PageHero title={info[0]} description={info[1]} />
        <form className="site-filters" action={route}>
          <label className="site-search">
            <Search size={18} />
            <input
              aria-label="搜索公开成长记忆"
              name="q"
              defaultValue={str(query, "q")}
              placeholder={
                mode === "works" ? "找找喜欢的作品…" : "搜索成长记忆…"
              }
            />
          </label>
          {mode === "timeline" && (
            <select
              aria-label="记录类型"
              name="type"
              defaultValue={str(query, "type")}
            >
              <option value="">全部记忆</option>
              {ENTRY_TYPES.map((t) => (
                <option value={t.value} key={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
          <input
            className="site-year-input"
            aria-label="发生年份"
            name="year"
            inputMode="numeric"
            pattern="[0-9]{4}"
            placeholder="发生年份"
            defaultValue={str(query, "year")}
          />
          <button className="secondary-button" type="submit">
            查找
          </button>
        </form>
        <div className="site-result-meta">
          {data.totalDocs}{" "}
          {mode === "works"
            ? "件公开作品"
            : mode === "honors"
              ? "个小里程碑"
              : "段公开记忆"}
        </div>
        {error ? (
          <p className="error-box" role="alert">
            {error}
          </p>
        ) : !data.docs.length ? (
          <EmptyState
            title={
              str(query, "q") || str(query, "year")
                ? "还没找到这段记忆"
                : "故事，正在慢慢生长。"
            }
            description="每一份喜欢、每一个第一次，都值得慢慢收藏。"
          />
        ) : mode === "timeline" ? (
          <div className="site-timeline">
            {Object.entries(groups).map(([year, entries]) => (
              <section className="site-timeline-year" key={year}>
                <h2>{year}</h2>
                <div>
                  {entries.map((e) => (
                    <Link
                      className="site-timeline-card"
                      href={`/entries/${e.id}`}
                      key={e.id}
                    >
                      <EntryArtwork entry={e} />
                      <div>
                        <time>{displayDate(e)}</time>
                        <span className={`site-tag kind-${e.type}`}>
                          {ENTRY_TYPES.find((t) => t.value === e.type)?.label}
                        </span>
                        <h3>{entryTitle(e)}</h3>
                        <p>{e.content.slice(0, 100)}</p>
                        <span className="site-read-more">
                          阅读这段记忆 <ArrowRight size={14} />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="memory-grid">
            {data.docs.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        )}
        <Pagination data={data} route={route} query={query} />
        <section
          className={`site-note-banner ${mode === "works" ? "pink" : ""}`}
        >
          <Flower2 size={36} />
          <div>
            <h2>
              {mode === "works"
                ? "不必很厉害，喜欢就值得收藏。"
                : "和昨天的自己比，已经走了好远。"}
            </h2>
            <p>不着急，每个人都有自己的生长节奏。</p>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}

function ProjectCard({ project: p }: { project: GrowthProject }) {
  return (
    <Link className="project-card" href={`/projects/${p.id}`}>
      {p.cover && typeof p.cover !== "number" ? (
        <img
          src={mediaUrl(p.cover.url)}
          alt={p.cover.alt || p.title}
          loading="lazy"
        />
      ) : (
        <div className="project-cover-fallback">
          <BookOpen size={56} strokeWidth={1.3} />
          <Usagi size={130} />
        </div>
      )}
      <div>
        <span
          className={`site-tag ${p.status === "completed" ? "sky" : "sage"}`}
        >
          {p.status === "completed" ? "已经完成" : "正在探索"}
        </span>
        <h2>{p.title}</h2>
        <p>{p.summary || "把喜欢的事，慢慢做成一个故事。"}</p>
        <span className="site-read-more">
          {p.entryCount || 0} 段相关记忆 · {p.workCount || 0} 件作品{" "}
          <ArrowRight size={17} />
        </span>
      </div>
    </Link>
  );
}
export async function PublicProjects({ query }: { query: Query }) {
  const profile = await publicProfile();
  if (!profile.modules.projects) notFound();
  let error = "";
  const p = new URLSearchParams({
    page: str(query, "page") || "1",
    status: str(query, "status"),
  });
  const data = await publicApi<PageData<GrowthProject>>(`/projects?${p}`).catch(
    (e) => {
      error = e.message;
      return emptyPage<GrowthProject>();
    },
  );
  return (
    <SiteShell profile={profile}>
      <main className="site-main site-list-page">
        <PageHero
          title="把喜欢的事，慢慢做成一个故事。"
          description="收藏持续探索的小计划，以及它们一路生长的过程。"
        />
        <div className="site-filter-links">
          {[
            ["", "全部项目"],
            ["exploring", "正在探索"],
            ["completed", "已经完成"],
          ].map(([v, l]) => (
            <Link
              className={str(query, "status") === v ? "selected" : ""}
              href={`/projects${v ? `?status=${v}` : ""}`}
              key={v}
            >
              {l}
            </Link>
          ))}
        </div>
        {error ? (
          <p className="error-box" role="alert">
            {error}
          </p>
        ) : data.docs.length ? (
          <div className="project-grid">
            {data.docs.map((p) => (
              <ProjectCard project={p} key={p.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="下一个喜欢的小计划，正在酝酿。"
            description="公开的成长项目会在这里慢慢长出来。"
          />
        )}
        <Pagination data={data} route="/projects" query={query} />
      </main>
    </SiteShell>
  );
}
export async function PublicProjectDetail({ id }: { id: string }) {
  const profile = await publicProfile();
  if (!profile.modules.projects) notFound();
  const project = await publicApi<GrowthProject>(
    `/projects/${encodeURIComponent(id)}`,
  ).catch((e) => {
    if (e.message === "not-found") notFound();
    throw e;
  });
  const related = await publicApi<PageData<PublicEntry>>(
    `/entries?project=${encodeURIComponent(id)}&limit=60`,
  );
  return (
    <SiteShell profile={profile}>
      <main className="site-main site-project-detail">
        <Link className="back-link" href="/projects">
          <ArrowLeft size={16} />
          回到成长项目
        </Link>
        <section className="project-detail-hero">
          {project.cover && typeof project.cover !== "number" ? (
            <img
              src={mediaUrl(project.cover.url)}
              alt={project.cover.alt || project.title}
            />
          ) : (
            <div className="project-cover-fallback">
              <Usagi size={260} />
            </div>
          )}
          <div>
            <span className="site-tag sage">
              {project.status === "completed" ? "已经完成" : "正在探索"}
            </span>
            <h1>{project.title}</h1>
            <p>{project.summary}</p>
            <small>
              {project.startedAt
                ? `${project.startedAt.slice(0, 7).replace("-", ".")} 开始 · `
                : ""}
              {project.entryCount || 0} 段相关记忆
            </small>
          </div>
        </section>
        <section className="project-description">
          <h2>这个小计划，从哪里开始</h2>
          <p>{project.description || "每一次尝试，都在把喜欢慢慢变成故事。"}</p>
        </section>
        <div className="site-section-heading">
          <div>
            <h2>一路长出来的记忆</h2>
            <span>RELATED LITTLE MOMENTS</span>
          </div>
        </div>
        {related.docs.length ? (
          <div className="memory-grid">
            {related.docs.map((e) => (
              <EntryCard entry={e} key={e.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="过程中的小记忆，正在慢慢收藏。"
            description="与这个项目关联并公开的记录会出现在这里。"
          />
        )}
      </main>
    </SiteShell>
  );
}
export async function PublicMemory({ id }: { id: string }) {
  const [profile, entry] = await Promise.all([
    publicProfile(),
    publicApi<PublicEntry>(`/entries/${encodeURIComponent(id)}`).catch((e) => {
      if (e.message === "not-found") notFound();
      throw e;
    }),
  ]);
  return (
    <SiteShell profile={profile}>
      <main className="site-main site-memory-detail">
        <Link
          className="back-link"
          href={entry.type === "work" ? "/works" : "/timeline"}
        >
          <ArrowLeft size={16} />
          回到成长手记
        </Link>
        <article>
          <span className={`site-tag kind-${entry.type}`}>
            {ENTRY_TYPES.find((t) => t.value === entry.type)?.label}
          </span>
          <h1>{entryTitle(entry)}</h1>
          <div className="site-memory-byline">
            <time>
              {displayDate(entry)}
              {entry.retrospective ? " · 回忆补录" : ""}
            </time>
            <span>
              <Globe2 size={14} />
              公开记忆
            </span>
          </div>
          {entryCover(entry) && (
            <div className="site-detail-cover">
              <MediaView media={entryCover(entry)!} />
            </div>
          )}
          <div className="site-memory-content">{entry.content}</div>
          {entry.reflection && (
            <section className="reflection-block">
              <span>当时的心情</span>
              <p>{entry.reflection}</p>
            </section>
          )}
          {entry.learning && (
            <section className="reflection-block learning">
              <span>这一次的小收获</span>
              <p>{entry.learning}</p>
            </section>
          )}
          <div className="detail-media">
            {entry.media
              .filter((m) => m.id !== entryCover(entry)?.id)
              .map((m) => (
                <MediaView media={m} key={m.id} />
              ))}
          </div>
          <div className="detail-tags">
            {entry.tags?.map((t) => (
              <span className="site-tag" key={t.label}>
                {t.label}
              </span>
            ))}
            {entry.projects?.map((p) => (
              <Link
                className="site-tag sage"
                href={`/projects/${p.id}`}
                key={p.id}
              >
                {p.title}
                <ArrowRight size={13} />
              </Link>
            ))}
          </div>
        </article>
      </main>
    </SiteShell>
  );
}
