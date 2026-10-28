import { get, set, del, keys, delMany } from "idb-keyval";
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
