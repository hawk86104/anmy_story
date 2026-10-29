import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  draftFingerprint,
  draftKey,
  listDeviceDrafts,
  removeDraft,
  writeDraft,
} from "../lib/drafts.ts";

test("只列出当前家庭和账号有内容的设备草稿，保留新建和已有记录的草稿", async () => {
  globalThis.indexedDB = new IDBFactory();
  const user = { familyId: "family-a", id: 1 };
  const sibling = { familyId: "family-a", id: 2 };
  const stranger = { familyId: "family-b", id: 1 };
  const draft = (title, updatedAt) => ({
    title,
    content: "正文",
    updatedAt,
    media: [],
  });
  await writeDraft(draftKey(user), draft("新草稿", "2026-10-28T00:00:00.000Z"));
  await writeDraft(
    draftKey(user, 42),
    draft("编辑记录", "2026-10-29T00:00:00.000Z"),
  );
  await writeDraft(draftKey(user, 43), {
    title: "",
    content: "",
    media: [],
    updatedAt: "2026-10-27T00:00:00.000Z",
  });
  await writeDraft(
    draftKey(sibling),
    draft("其他成员", "2026-10-29T00:00:00.000Z"),
  );
  await writeDraft(
    draftKey(stranger),
    draft("其他家庭", "2026-10-29T00:00:00.000Z"),
  );
  const list = await listDeviceDrafts(user);
  assert.deepEqual(
    list.map((item) => [item.id, item.draft.title]),
    [
      [42, "编辑记录"],
      [null, "新草稿"],
      [43, ""],
    ],
  );
  assert.equal((await listDeviceDrafts(sibling))[0].draft.title, "其他成员");
  await removeDraft(draftKey(user, 42));
  assert.deepEqual(
    (await listDeviceDrafts(user)).map((item) => item.id),
    [null, 43],
  );
});

test("已有记录只有正文、标签或附件等实际修改才产生不同草稿", () => {
  const form = {
    title: "原记录",
    content: "内容",
    tags: [],
    media: [],
    clientId: "one",
    revision: 1,
  };
  assert.equal(
    draftFingerprint(form, []),
    draftFingerprint({ ...form, clientId: "two", revision: 2 }, []),
  );
  assert.notEqual(
    draftFingerprint(form, []),
    draftFingerprint({ ...form, content: "修改" }, []),
  );
  assert.notEqual(
    draftFingerprint(form, []),
    draftFingerprint({ ...form, tags: [{ label: "获奖" }] }, []),
  );
  assert.notEqual(
    draftFingerprint(form, []),
    draftFingerprint(form, [{ media: { id: 10 }, imageKind: "photo" }]),
  );
});
