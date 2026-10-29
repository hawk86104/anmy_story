import {
  addDataAndFileToRequest,
  type Endpoint,
  type PayloadRequest,
  type Where,
} from "payload";
import { member, relationId } from "./access";
import { json, spaceDTO } from "./public-entries";
import { mediaReferences } from "./media-links";
import { DEFAULT_ENTRY_TAGS, MAX_ENTRY_TAG_OPTIONS } from "@mylife/shared";

function tagOptions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [...DEFAULT_ENTRY_TAGS];
}

async function familySpace(req: PayloadRequest) {
  const u = member(req)!;
  const find = () =>
    req.payload.find({
      collection: "spaces",
      where: { familyId: { equals: u.familyId } },
      depth: 0,
      limit: 1,
      overrideAccess: false,
      user: req.user,
      req,
    });
  const found = await find();
  if (found.docs[0]) return found.docs[0];
  try {
    return await req.payload.create({
      collection: "spaces",
      data: {
        displayName: "我的成长手记",
        theme: "usagi",
        owner: u.id,
        familyId: u.familyId,
      },
      overrideAccess: false,
      user: req.user,
      req,
    });
  } catch (error) {
    const retry = await find();
    if (retry.docs[0]) return retry.docs[0];
    throw error;
  }
}

export const familyEndpoints: Endpoint[] = [
  {
    path: "/family/entry-tags",
    method: "get",
    handler: async (req) => {
      if (!member(req)) return json({ error: "请先登录。" }, 401);
      const space = await familySpace(req);
      return json({ tags: tagOptions(space.entryTagOptions) });
    },
  },
  {
    path: "/family/entry-tags",
    method: "patch",
    handler: async (req) => {
      if (member(req)?.role !== "parent")
        return json({ error: "仅家长可以管理常用标签。" }, 403);
      await addDataAndFileToRequest(req);
      const tags = req.data?.tags;
      if (
        !Array.isArray(tags) ||
        tags.length > MAX_ENTRY_TAG_OPTIONS ||
        tags.some(
          (label) =>
            typeof label !== "string" ||
            !label.trim() ||
            label.trim().length > 20,
        )
      )
        return json(
          {
            error: `标签需为 1 至 20 个字，最多 ${MAX_ENTRY_TAG_OPTIONS} 个。`,
          },
          400,
        );
      const normalized = tags.map((label: string) => label.trim());
      if (
        new Set(normalized.map((label: string) => label.toLocaleLowerCase()))
          .size !== normalized.length
      )
        return json({ error: "常用标签不能重复。" }, 400);
      const space = await familySpace(req);
      const updated = await req.payload.update({
        collection: "spaces",
        id: space.id,
        data: { entryTagOptions: normalized },
        depth: 0,
        overrideAccess: false,
        user: req.user,
        req,
      });
      return json({ tags: tagOptions(updated.entryTagOptions) });
    },
  },
  {
    path: "/family/space",
    method: "get",
    handler: async (req) => {
      const u = member(req);
      if (!u) return json({ error: "请先登录。" }, 401);
      const space = await familySpace(req);
      return json({
        ...(await spaceDTO(space, req, true)),
        canEdit: u.role === "parent" || relationId(space.owner) === u.id,
      });
    },
  },
  {
    path: "/family/space",
    method: "patch",
    handler: async (req) => {
      if (!member(req)) return json({ error: "请先登录。" }, 401);
      await addDataAndFileToRequest(req);
      const space = await familySpace(req),
        data = req.data || {};
      const allowed = Object.fromEntries(
        [
          "displayName",
          "bio",
          "interests",
          "avatar",
          "cover",
          "theme",
          "modules",
        ]
          .filter((k) => k in data)
          .map((k) => [k, data[k]]),
      );
      const updated = await req.payload.update({
        collection: "spaces",
        id: space.id,
        data: allowed,
        depth: 0,
        overrideAccess: false,
        user: req.user,
        req,
      });
      return json({ ...(await spaceDTO(updated, req, true)), canEdit: true });
    },
  },
  {
    path: "/family/overview",
    method: "get",
    handler: async (req) => {
      const u = member(req);
      if (!u) return json({ error: "请先登录。" }, 401);
      const [records, files, drafts, pending] = await Promise.all([
        req.payload.count({
          collection: "entries",
          where: { status: { equals: "saved" } },
          user: req.user,
          overrideAccess: false,
          req,
        }),
        req.payload.count({
          collection: "media",
          where: { familyId: { equals: u.familyId } },
          user: req.user,
          overrideAccess: false,
          req,
        }),
        req.payload.count({
          collection: "entries",
          where: { status: { equals: "draft" } },
          user: req.user,
          overrideAccess: false,
          req,
        }),
        req.payload.count({
          collection: "media",
          where: {
            and: [
              { familyId: { equals: u.familyId } },
              { processingStatus: { in: ["queued", "processing"] } },
            ],
          },
          user: req.user,
          overrideAccess: false,
          req,
        }),
      ]);
      return json({
        records: records.totalDocs,
        media: files.totalDocs,
        drafts: drafts.totalDocs,
        processing: pending.totalDocs,
      });
    },
  },
  {
    path: "/family/media",
    method: "get",
    handler: async (req) => {
      const u = member(req);
      if (u?.role !== "parent")
        return json({ error: "仅家长可以管理家庭素材。" }, 403);
      const q = new URL(req.url || "http://local/", "http://local")
        .searchParams;
      const kind = q.get("kind"),
        search = q.get("q")?.slice(0, 120),
        page = Math.max(1, Math.min(10000, Number(q.get("page")) || 1));
      const clauses: Where[] = [{ familyId: { equals: u.familyId } }];
      if (["image", "video", "audio"].includes(kind || ""))
        clauses.push({ mimeType: { like: `${kind}/` } });
      if (search) clauses.push({ filename: { contains: search } });
      const list = await req.payload.find({
        collection: "media",
        where: { and: clauses },
        sort: "-createdAt",
        limit: 20,
        page,
        depth: 0,
        user: req.user,
        overrideAccess: false,
        req,
      });
      return json({
        ...list,
        docs: await Promise.all(
          list.docs.map(async (file) => ({
            ...file,
            referenceCount: await mediaReferences(file.id, req),
          })),
        ),
      });
    },
  },
];
