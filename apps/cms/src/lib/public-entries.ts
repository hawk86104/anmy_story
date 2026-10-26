import type { Endpoint, PayloadRequest, Where } from "payload";
import type { Media, PublicEntry } from "@mylife/shared";
import type { Entry } from "../payload-types";
import { relationId } from "./access";

export const publicEntryWhere: Where = {
  and: [
    { status: { equals: "saved" } },
    { visibility: { equals: "public" } },
    { publicSnapshot: { exists: true } },
  ],
};

async function publicEntries(docs: Entry[], req: PayloadRequest) {
  const ids = docs.flatMap(
    (doc) => (doc.publicSnapshot as { media?: number[] })?.media || [],
  );
  const media = ids.length
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
  const mediaById = new Map(media.docs.map((item) => [item.id, item]));
  return docs.map((doc): PublicEntry => {
    const snapshot = doc.publicSnapshot as unknown as Omit<
      PublicEntry,
      "media"
    > & {
      media?: number[];
    };
    return {
      id: doc.id,
      title: snapshot.title,
      type: snapshot.type,
      content: snapshot.content,
      reflection: snapshot.reflection,
      learning: snapshot.learning,
      occurredAt: snapshot.occurredAt,
      datePrecision: snapshot.datePrecision,
      dateNote: snapshot.dateNote,
      retrospective: snapshot.retrospective,
      tags: snapshot.tags?.map((tag) => ({ label: tag.label })),
      revision: snapshot.revision,
      media: (snapshot.media || []).flatMap((id): Media[] => {
        const item = mediaById.get(relationId(id));
        if (!item || item.familyId !== doc.familyId) return [];
        return [
          {
            id: item.id,
            filename: item.filename || "",
            mimeType: item.mimeType || "",
            filesize: item.filesize || 0,
            url: item.url || "",
            alt: item.alt || undefined,
            processingStatus: item.processingStatus || "ready",
          },
        ];
      }),
    };
  });
}

const headers = { "Cache-Control": "no-store" };
export const publicEntryEndpoints: Endpoint[] = [
  {
    path: "/public/entries",
    method: "get",
    handler: async (req) => {
      const entries = await req.payload.find({
        collection: "entries",
        where: publicEntryWhere,
        sort: "-occurredAt,-createdAt",
        depth: 0,
        limit: 100,
        overrideAccess: true,
        req,
      });
      return Response.json(
        {
          docs: await publicEntries(entries.docs, req),
          totalDocs: entries.totalDocs,
        },
        { headers },
      );
    },
  },
  {
    path: "/public/entries/:id",
    method: "get",
    handler: async (req) => {
      const id = String(req.routeParams?.id || "");
      const notFound = () =>
        Response.json(
          { error: "这段记忆尚未公开，或已改为仅自己和家长可见。" },
          { status: 404, headers },
        );
      if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)))
        return notFound();
      const entries = await req.payload.find({
        collection: "entries",
        where: { and: [publicEntryWhere, { id: { equals: Number(id) } }] },
        depth: 0,
        limit: 1,
        overrideAccess: true,
        req,
      });
      if (!entries.docs.length) return notFound();
      const [entry] = await publicEntries(entries.docs, req);
      return Response.json(entry, { headers });
    },
  },
];
