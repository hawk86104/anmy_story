import type { Adapter } from "@payloadcms/plugin-cloud-storage/types";
import {
  mediaKey,
  putStored,
  queueStorageDelete,
  readMedia,
  signedMediaURL,
  storageMode,
} from "./storage";

export const mediaStorageAdapter: Adapter = () => ({
  name: "mylife-cos",
  handleUpload: async ({ file, storageFilePath, req }) => {
    const mode = storageMode();
    await putStored(storageFilePath, file.buffer, file.mimeType, mode);
    if (req.context.trackUploads) {
      const uploads = (req.context.uploadedObjects ||= []) as {
        key: string;
        mode: string;
      }[];
      uploads.push({ key: storageFilePath, mode });
    }
  },
  handleDelete: async ({ doc, storageFilePath, req }) => {
    if (
      (req.context.deletedMediaIds as string[] | undefined)?.includes(
        String(doc.id),
      )
    )
      return;
    await queueStorageDelete(
      req,
      String((doc as unknown as { familyId: string }).familyId),
      storageFilePath,
      (doc as { storage?: string }).storage || "local",
    );
  },
  staticHandler: async (req, { doc }) => {
    if (!doc) return new Response(null, { status: 404 });
    const media = doc as unknown as Parameters<typeof readMedia>[0];
    if (media.storage === "cos")
      return Response.redirect(signedMediaURL(mediaKey(media)), 307);
    // The Payload file route has already checked collection read access.
    const bytes = await readMedia(media);
    const mime =
      (doc as unknown as { mimeType?: string }).mimeType ||
      "application/octet-stream";
    const range = req.headers.get("range");
    const headers: Record<string, string> = {
      "Content-Type": mime,
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
    };
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
        });
      const start = match[1]
        ? Number(match[1])
        : Math.max(0, bytes.length - Number(match[2]));
      const end =
        match[1] && match[2]
          ? Math.min(Number(match[2]), bytes.length - 1)
          : bytes.length - 1;
      if (start > end || start >= bytes.length)
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
        });
      return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
    return new Response(new Uint8Array(bytes), {
      headers: { ...headers, "Content-Length": String(bytes.length) },
    });
  },
});
