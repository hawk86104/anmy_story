import { get, getMany, set, del, keys, delMany } from "idb-keyval";
import type { EntryInput, Member } from "@mylife/shared";
import type { Media } from "@mylife/shared";
export interface Draft extends EntryInput {
  updatedAt: string;
  remoteId?: number;
  mediaInfo?: import("@mylife/shared").Media[];
  pendingFiles?: { file: File; imageKind: string }[];
}
export const draftKey = (user: Member, id?: number) =>
  `mylife:v1:${user.familyId}:${user.id}:${id || "new"}`;
export async function readDraft(key: string) {
  return get<Draft>(key);
}
export async function writeDraft(key: string, draft: Draft) {
  return set(key, draft);
}
export async function removeDraft(key: string) {
  return del(key);
}
export async function listDeviceDrafts(user: Member) {
  const prefix = `mylife:v1:${user.familyId}:${user.id}:`;
  const matching = (await keys()).filter(
    (key): key is string =>
      typeof key === "string" &&
      key.startsWith(prefix) &&
      /^(new|\d+)$/.test(key.slice(prefix.length)),
  );
  const values = await getMany<Draft>(matching);
  return matching
    .flatMap((key, index) => {
      const draft = values[index];
      if (!draft || typeof draft !== "object") return [];
      const hasContent =
        [
          draft.title,
          draft.content,
          draft.reflection,
          draft.learning,
          draft.parentNote,
        ].some((value) => typeof value === "string" && value.trim()) ||
        Boolean(
          draft.media?.length ||
          draft.mediaInfo?.length ||
          draft.pendingFiles?.length,
        );
      const suffix = key.slice(prefix.length);
      if (!hasContent && suffix === "new") return [];
      return [{ id: suffix === "new" ? null : Number(suffix), draft }];
    })
    .sort((a, b) =>
      (b.draft.updatedAt || "").localeCompare(a.draft.updatedAt || ""),
    );
}
export function draftFingerprint(
  form: EntryInput,
  items: { file?: File; media?: Media; imageKind: string }[],
) {
  const {
    clientId: _clientId,
    revision: _revision,
    media: _media,
    ...fields
  } = form;
  return JSON.stringify({
    ...fields,
    attachments: items.map((item) =>
      item.media
        ? { id: item.media.id }
        : item.file
          ? {
              name: item.file.name,
              size: item.file.size,
              lastModified: item.file.lastModified,
              imageKind: item.imageKind,
            }
          : null,
    ),
  });
}
export async function clearFamilyDrafts(familyId: string) {
  const matching = (await keys()).filter(
    (key) =>
      typeof key === "string" && key.startsWith(`mylife:v1:${familyId}:`),
  );
  await delMany(matching);
}
export function snapshotDraft(
  form: EntryInput,
  items: { file?: File; media?: Media; imageKind: string }[],
): Draft {
  return {
    ...form,
    media: items.flatMap((i) => (i.media ? [i.media.id] : [])),
    mediaInfo: items.flatMap((i) => (i.media ? [i.media] : [])),
    pendingFiles: items
      .filter((i) => !i.media && i.file)
      .map((i) => ({ file: i.file!, imageKind: i.imageKind })),
    updatedAt: new Date().toISOString(),
  };
}
