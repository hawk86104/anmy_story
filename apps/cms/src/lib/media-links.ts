import type { PayloadRequest } from "payload";
import { relationId } from "./access";

export async function publicDecorativeMedia(
  req: PayloadRequest,
): Promise<number[]> {
  const [spaces, projects] = await Promise.all([
    req.payload.find({
      collection: "spaces",
      pagination: false,
      limit: 0,
      depth: 0,
      overrideAccess: true,
      req,
    }),
    req.payload.find({
      collection: "projects",
      where: { visibility: { equals: "public" } },
      pagination: false,
      limit: 0,
      depth: 0,
      overrideAccess: true,
      req,
    }),
  ]);
  return [
    ...new Set(
      [
        ...spaces.docs.flatMap((s) => [
          relationId(s.avatar),
          relationId(s.cover),
        ]),
        ...projects.docs.map((p) => relationId(p.cover)),
      ].filter(Boolean),
    ),
  ];
}

export async function mediaReferences(id: number, req: PayloadRequest) {
  const [entries, spaces, projects] = await Promise.all([
    req.payload.count({
      collection: "entries",
      where: { or: [{ media: { in: [id] } }, { publicMedia: { in: [id] } }] },
      overrideAccess: true,
      req,
    }),
    req.payload.count({
      collection: "spaces",
      where: { or: [{ avatar: { equals: id } }, { cover: { equals: id } }] },
      overrideAccess: true,
      req,
    }),
    req.payload.count({
      collection: "projects",
      where: { cover: { equals: id } },
      overrideAccess: true,
      req,
    }),
  ]);
  return entries.totalDocs + spaces.totalDocs + projects.totalDocs;
}
