import {
  addDataAndFileToRequest,
  type Endpoint,
  type PayloadRequest,
  type Where,
} from "payload";
import { member, relationId } from "./access";
import { json, spaceDTO } from "./public-entries";
import { mediaReferences } from "./media-links";

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
