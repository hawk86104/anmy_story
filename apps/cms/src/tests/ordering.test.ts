process.env.MEDIA_STORAGE = "local";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { handleEndpoints } from "payload";
import { ENTRY_LIST_SORT, PROJECT_LIST_SORT } from "@mylife/shared";
import { closePayload } from "../lib/shutdown";

test(
  "公开和家庭记录按发生时间、首次保存时间排序并稳定分页",
  { timeout: 120000 },
  async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "mylife-ordering-"));
    process.env.PAYLOAD_SECRET = randomBytes(32).toString("hex");
    process.env.DATABASE_URL = `file:${path.join(temp, "test.db")}`;
    process.env.MEDIA_ROOT = path.join(temp, "media");
    delete process.env.SITE_FAMILY_ID;
    const { getPayload } = await import("payload");
    const { default: config } = await import("../payload.config");
    const payload = await getPayload({ config });
    try {
      const familyId = randomUUID();
      const password = randomBytes(20).toString("hex");
      const parent = await payload.create({
        collection: "users",
        data: {
          name: "测试家长",
          email: "ordering@example.invalid",
          password,
          role: "parent",
          familyId,
        },
        overrideAccess: true,
        context: { bootstrap: true },
      });
      const makeProject = (
        title: string,
        startedAt: string | null,
        createdAt: string,
      ) =>
        payload.create({
          collection: "projects",
          data: {
            title,
            startedAt,
            createdAt,
            status: "exploring",
            visibility: "public",
            familyId,
            owner: parent.id,
          },
          user: parent,
          overrideAccess: false,
        });
      const projectOld = await makeProject(
        "老项目",
        "2020-01-01",
        "2026-01-01T00:00:00.000Z",
      );
      const projectNewA = await makeProject(
        "新项目早提交",
        "2024-01-01",
        "2023-01-01T00:00:00.000Z",
      );
      const projectNewB = await makeProject(
        "新项目晚提交",
        "2024-01-01",
        "2025-01-01T00:00:00.000Z",
      );
      const projectNewC = await makeProject(
        "新项目相同时间",
        "2024-01-01",
        "2025-01-01T00:00:00.000Z",
      );
      const projectUnknown = await makeProject(
        "时间待确认项目",
        null,
        "2026-02-01T00:00:00.000Z",
      );
      const expectedProjects = [
        projectNewC.id,
        projectNewB.id,
        projectNewA.id,
        projectOld.id,
        projectUnknown.id,
      ];

      const makeEntry = (
        title: string,
        occurredAt: string | null,
        createdAt: string,
        visibility: "public" | "family" = "public",
        status: "saved" | "draft" = "saved",
      ) =>
        payload.create({
          collection: "entries",
          data: {
            type: "work",
            title,
            content: `排序测试：${title}`,
            status,
            visibility,
            occurredAt,
            datePrecision: occurredAt ? "day" : "unknown",
            createdAt,
            clientId: randomUUID(),
            familyId,
            author: parent.id,
            projects: [projectNewB.id],
          },
          context: { restoreArchive: true },
          user: parent,
          overrideAccess: false,
        });
      const older = await makeEntry(
        "较早发生，较晚保存",
        "2020-05-01",
        "2026-07-01T00:00:00.000Z",
      );
      const newA = await makeEntry(
        "相同发生时间，较早保存",
        "2024-06-10",
        "2023-01-01T00:00:00.000Z",
      );
      const newB = await makeEntry(
        "相同发生时间，较晚保存",
        "2024-06-10",
        "2025-01-01T00:00:00.000Z",
      );
      const newC = await makeEntry(
        "发生与保存时间均相同",
        "2024-06-10",
        "2025-01-01T00:00:00.000Z",
      );
      const unknownOld = await makeEntry(
        "未知时间，较早保存",
        null,
        "2024-01-01T00:00:00.000Z",
      );
      const unknownNew = await makeEntry(
        "未知时间，较晚保存",
        null,
        "2026-01-01T00:00:00.000Z",
      );
      const privateEntry = await makeEntry(
        "私密记录",
        "2025-01-01",
        "2023-01-01T00:00:00.000Z",
        "family",
      );
      const draftOld = await makeEntry(
        "旧草稿",
        "2020-01-01",
        "2026-01-01T00:00:00.000Z",
        "family",
        "draft",
      );
      const draftNew = await makeEntry(
        "新草稿",
        "2024-01-01",
        "2023-01-01T00:00:00.000Z",
        "family",
        "draft",
      );
      // Modifying an old record must not move it to the top of the list.
      await payload.update({
        collection: "entries",
        id: older.id,
        data: { content: "排序测试：后续修改" },
        user: parent,
        overrideAccess: false,
      });
      const expectedPublic = [
        newC.id,
        newB.id,
        newA.id,
        older.id,
        unknownNew.id,
        unknownOld.id,
      ];
      const { token } = await payload.login({
        collection: "users",
        data: { email: parent.email, password },
      });
      assert.ok(token);
      const get = async (url: string, authenticated = false) => {
        const response = await handleEndpoints({
          config,
          request: new Request(`http://localhost:3001/api${url}`, {
            headers: authenticated ? { Authorization: `JWT ${token}` } : {},
          }),
        });
        assert.equal(response.status, 200, await response.clone().text());
        return response.json();
      };
      const ids = (result: { docs: { id: number }[] }) =>
        result.docs.map((doc) => doc.id);

      const publicPages = await Promise.all(
        [1, 2, 3].map((page) => get(`/public/entries?limit=2&page=${page}`)),
      );
      assert.deepEqual(publicPages.flatMap(ids), expectedPublic);
      assert.deepEqual(
        publicPages.map((page) => page.totalDocs),
        [6, 6, 6],
      );
      assert.deepEqual(ids(await get("/public/entries?type=work&year=2024")), [
        newC.id,
        newB.id,
        newA.id,
      ]);
      assert.deepEqual(
        ids(await get(`/public/entries?project=${projectNewB.id}`)),
        expectedPublic,
      );
      assert.deepEqual(ids(await get("/public/projects")), expectedProjects);

      const entryQuery = new URLSearchParams({
        "where[status][equals]": "saved",
        sort: ENTRY_LIST_SORT,
        limit: "2",
      });
      const familyPages = await Promise.all(
        [1, 2, 3, 4].map((page) =>
          get(`/entries?${entryQuery}&page=${page}`, true),
        ),
      );
      assert.deepEqual(familyPages.flatMap(ids), [
        privateEntry.id,
        ...expectedPublic,
      ]);
      const draftsQuery = new URLSearchParams({
        "where[status][equals]": "draft",
        sort: ENTRY_LIST_SORT,
      });
      assert.deepEqual(ids(await get(`/entries?${draftsQuery}`, true)), [
        draftNew.id,
        draftOld.id,
      ]);
      assert.deepEqual(
        ids(await get(`/projects?sort=${PROJECT_LIST_SORT}`, true)),
        expectedProjects,
      );
    } finally {
      await closePayload(payload);
      await rm(temp, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  },
);
