import type { Endpoint, PayloadRequest, Where } from "payload";
import type {
  GrowthProject,
  Media,
  PublicEntry,
  SpaceProfile,
} from "@mylife/shared";
import { ENTRY_TYPES } from "@mylife/shared";
import type {
  Entry,
  Media as StoredMedia,
  Project,
  Space,
} from "../payload-types";
import { relationId } from "./access";
export const publicEntryWhere: Where = {
  and: [
    { status: { equals: "saved" } },
    { visibility: { equals: "public" } },
    { publicSnapshot: { exists: true } },
  ],
};
export const noStore = { "Cache-Control": "no-store" };
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: noStore });
export const mediaDTO = (m: StoredMedia): Media => ({
  id: m.id,
  filename: m.filename || "",
  mimeType: m.mimeType || "",
  filesize: m.filesize || 0,
  url: m.url || "",
  alt: m.alt || undefined,
  processingStatus: m.processingStatus || "ready",
});
export async function siteSpace(req: PayloadRequest) {
  const r = await req.payload.find({
    collection: "spaces",
    ...(process.env.SITE_FAMILY_ID
      ? { where: { familyId: { equals: process.env.SITE_FAMILY_ID } } }
      : {}),
    sort: "createdAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  return r.docs[0];
}
export async function spaceDTO(
  s: Space | undefined,
  req: PayloadRequest,
  includeOwner = false,
): Promise<SpaceProfile> {
  const ids = [relationId(s?.avatar), relationId(s?.cover)].filter(Boolean);
  const files = ids.length
    ? await req.payload.find({
        collection: "media",
        where: {
          and: [{ id: { in: ids } }, { familyId: { equals: s!.familyId } }],
        },
        limit: 2,
        depth: 0,
        overrideAccess: true,
        req,
      })
    : { docs: [] };
  const byId = new Map(files.docs.map((m) => [m.id, mediaDTO(m)]));
  return {
    ...(includeOwner && s ? { id: s.id, owner: relationId(s.owner) } : {}),
    displayName: s?.displayName || "我的成长手记",
    bio: s?.bio || "关于探索、创造，和每一个小小的进步。",
    interests: s?.interests?.map((i) => ({ label: i.label })) || [],
    theme: s?.theme || "usagi",
    avatar: byId.get(relationId(s?.avatar)) || null,
    cover: byId.get(relationId(s?.cover)) || null,
    modules: {
      timeline: s?.modules?.timeline !== false,
      works: s?.modules?.works !== false,
      honors: s?.modules?.honors !== false,
      projects: s?.modules?.projects !== false,
    },
  };
}
export async function projectDTO(
  p: Project,
  req: PayloadRequest,
): Promise<GrowthProject> {
  const id = relationId(p.cover),
    covers = id
      ? await req.payload.find({
          collection: "media",
          where: {
            and: [{ id: { equals: id } }, { familyId: { equals: p.familyId } }],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })
      : { docs: [] };
  const related: Where = {
    and: [
      publicEntryWhere,
      { or: [{ projects: { in: [p.id] } }, { mainProject: { equals: p.id } }] },
    ],
  };
  const [entries, works] = await Promise.all([
    req.payload.count({
      collection: "entries",
      where: related,
      overrideAccess: true,
      req,
    }),
    req.payload.count({
      collection: "entries",
      where: { and: [related, { type: { equals: "work" } }] },
      overrideAccess: true,
      req,
    }),
  ]);
  return {
    id: p.id,
    title: p.title,
    summary: p.summary,
    description: p.description,
    status: p.status,
    visibility: p.visibility,
    startedAt: p.startedAt,
    cover: covers.docs[0] ? mediaDTO(covers.docs[0]) : null,
    entryCount: entries.totalDocs,
    workCount: works.totalDocs,
    createdAt: p.createdAt,
  };
}
export async function publicEntries(
  docs: Entry[],
  req: PayloadRequest,
): Promise<PublicEntry[]> {
  type Snapshot = Omit<
    PublicEntry,
    "id" | "media" | "coverMedia" | "projects"
  > & { media?: number[]; coverMedia?: number; projects?: number[] };
  const snapshots = docs.map((d) => d.publicSnapshot as unknown as Snapshot),
    ids = [...new Set(snapshots.flatMap((s) => s.media || []))],
    projectIds = [...new Set(snapshots.flatMap((s) => s.projects || []))];
  const files = ids.length
    ? await req.payload.find({
        collection: "media",
        where: { id: { in: ids } },
        pagination: false,
        limit: 0,
        depth: 0,
        overrideAccess: true,
        req,
      })
    : { docs: [] };
  const projects = projectIds.length
    ? await req.payload.find({
        collection: "projects",
        where: {
          and: [
            { id: { in: projectIds } },
            { visibility: { equals: "public" } },
          ],
        },
        pagination: false,
        limit: 0,
        depth: 0,
        overrideAccess: true,
        req,
      })
    : { docs: [] };
  const byId = new Map(files.docs.map((m) => [m.id, m]));
  return docs.map((d, i) => {
    const s = snapshots[i],
      media = (s.media || []).flatMap((id) => {
        const m = byId.get(relationId(id));
        return m && m.familyId === d.familyId ? [mediaDTO(m)] : [];
      });
    return {
      id: d.id,
      title: s.title,
      type: s.type,
      content: s.content,
      reflection: s.reflection,
      learning: s.learning,
      occurredAt: s.occurredAt,
      datePrecision: s.datePrecision,
      dateNote: s.dateNote,
      retrospective: s.retrospective,
      tags: s.tags?.map((t) => ({ label: t.label })),
      revision: s.revision,
      media,
      coverMedia: media.find((m) => m.id === relationId(s.coverMedia)) || null,
      projects: projects.docs
        .filter((p) => p.familyId === d.familyId && s.projects?.includes(p.id))
        .map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          visibility: "public",
          summary: p.summary,
        })),
    };
  });
}
const query = (req: PayloadRequest) =>
  new URL(req.url || "http://local/", "http://local").searchParams;
const num = (s: string | null, fallback: number, max: number) =>
  s && /^\d+$/.test(s) ? Math.max(1, Math.min(max, Number(s))) : fallback;
const missing = () =>
  json({ error: "这段记忆尚未公开，或已改为仅自己和家长可见。" }, 404);
export const publicEntryEndpoints: Endpoint[] = [
  {
    path: "/public/entries",
    method: "get",
    handler: async (req) => {
      const q = query(req),
        conditions: Where[] = [publicEntryWhere],
        space = await siteSpace(req);
      if (space) conditions.push({ familyId: { equals: space.familyId } });
      const type = q.get("type");
      if (type && ENTRY_TYPES.some((t) => t.value === type))
        conditions.push({ type: { equals: type } });
      const search = q.get("q")?.trim().slice(0, 120);
      if (search)
        conditions.push({
          or: [
            { title: { contains: search } },
            { content: { contains: search } },
          ],
        });
      const year = q.get("year");
      if (year && /^\d{4}$/.test(year))
        conditions.push({
          and: [
            {
              occurredAt: { greater_than_equal: `${year}-01-01T00:00:00.000Z` },
            },
            {
              occurredAt: {
                less_than: `${Number(year) + 1}-01-01T00:00:00.000Z`,
              },
            },
          ],
        });
      const project = q.get("project");
      if (project && /^\d+$/.test(project))
        conditions.push({
          or: [
            { projects: { in: [Number(project)] } },
            { mainProject: { equals: Number(project) } },
          ],
        });
      const r = await req.payload.find({
        collection: "entries",
        where: { and: conditions },
        sort: "-occurredAt,-createdAt",
        depth: 0,
        limit: num(q.get("limit"), 20, 60),
        page: num(q.get("page"), 1, 100000),
        overrideAccess: true,
        req,
      });
      return json({
        docs: await publicEntries(r.docs, req),
        totalDocs: r.totalDocs,
        totalPages: r.totalPages,
        page: r.page,
        hasNextPage: r.hasNextPage,
      });
    },
  },
  {
    path: "/public/entries/:id",
    method: "get",
    handler: async (req) => {
      const id = String(req.routeParams?.id || "");
      if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)))
        return missing();
      const r = await req.payload.find({
        collection: "entries",
        where: { and: [publicEntryWhere, { id: { equals: Number(id) } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      });
      return r.docs[0]
        ? json((await publicEntries(r.docs, req))[0])
        : missing();
    },
  },
  {
    path: "/public/profile",
    method: "get",
    handler: async (req) => {
      const space = await siteSpace(req),
        p = await spaceDTO(space, req),
        family: Where = space ? { familyId: { equals: space.familyId } } : {};
      const [e, w, h, projects] = await Promise.all([
        req.payload.count({
          collection: "entries",
          where: { and: [publicEntryWhere, family] },
          overrideAccess: true,
          req,
        }),
        req.payload.count({
          collection: "entries",
          where: {
            and: [publicEntryWhere, family, { type: { equals: "work" } }],
          },
          overrideAccess: true,
          req,
        }),
        req.payload.count({
          collection: "entries",
          where: {
            and: [publicEntryWhere, family, { type: { equals: "honor" } }],
          },
          overrideAccess: true,
          req,
        }),
        req.payload.count({
          collection: "projects",
          where: { and: [family, { visibility: { equals: "public" } }] },
          overrideAccess: true,
          req,
        }),
      ]);
      p.stats = {
        entries: e.totalDocs,
        works: w.totalDocs,
        honors: h.totalDocs,
        projects: projects.totalDocs,
      };
      return json(p);
    },
  },
  {
    path: "/public/projects",
    method: "get",
    handler: async (req) => {
      const space = await siteSpace(req),
        q = query(req);
      const where: Where = {
        and: [
          { visibility: { equals: "public" } },
          ...(space ? [{ familyId: { equals: space.familyId } }] : []),
          ...(["exploring", "completed"].includes(q.get("status") || "")
            ? [{ status: { equals: q.get("status") } }]
            : []),
        ],
      };
      const r = await req.payload.find({
        collection: "projects",
        where,
        sort: "-startedAt,-createdAt",
        limit: 20,
        page: num(q.get("page"), 1, 100000),
        depth: 0,
        overrideAccess: true,
        req,
      });
      return json({
        docs: await Promise.all(r.docs.map((p) => projectDTO(p, req))),
        totalDocs: r.totalDocs,
        hasNextPage: r.hasNextPage,
        page: r.page,
        totalPages: r.totalPages,
      });
    },
  },
  {
    path: "/public/projects/:id",
    method: "get",
    handler: async (req) => {
      const id = Number(req.routeParams?.id);
      if (!Number.isSafeInteger(id) || id < 1)
        return json({ error: "这个项目暂未公开。" }, 404);
      const r = await req.payload.find({
        collection: "projects",
        where: {
          and: [{ id: { equals: id } }, { visibility: { equals: "public" } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      });
      return r.docs[0]
        ? json(await projectDTO(r.docs[0], req))
        : json({ error: "这个项目暂未公开。" }, 404);
    },
  },
];
