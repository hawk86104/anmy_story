import path from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { APIError, type Payload } from "payload";
import { relationId } from "./access";

type Row = Record<string, any>;
export async function restoreFamilyArchive(
  payload: Payload,
  options: {
    source: string;
    familyId: string;
    apply?: boolean;
    allowMissing?: boolean;
  },
) {
  const source = await realpath(path.resolve(options.source)),
    metadata = path.join(source, "archive.json");
  if ((await stat(metadata)).size > 64 * 1024 * 1024)
    throw new Error("档案索引超过 64 MB，请分批恢复。");
  const data = JSON.parse(await readFile(metadata, "utf8"));
  if (
    data.format !== "mylife-archive" ||
    data.version !== 1 ||
    ![data.entries, data.media, data.projects, data.members].every(
      Array.isArray,
    )
  )
    throw new Error("这不是支持的 MyLife 成长档案。");
  const users = await payload.find({
    collection: "users",
    where: { familyId: { equals: options.familyId } },
    pagination: false,
    limit: 0,
    depth: 0,
    overrideAccess: true,
  });
  const parent = users.docs.find((u) => u.role === "parent");
  if (!parent) throw new Error("目标家庭还没有家长账号，请先建立账号。");
  const child = users.docs.find((u) => u.role === "child") || parent;
  const author = (old: unknown) => {
    const original = (data.members as Row[]).find(
      (m) => m.id === relationId(old),
    );
    return users.docs.find((m) => m.email === original?.email)?.id || child.id;
  };
  async function file(relative: unknown) {
    if (typeof relative !== "string" || !relative || path.isAbsolute(relative))
      return null;
    const candidate = path.resolve(source, relative);
    if (!candidate.startsWith(source + path.sep))
      throw new Error("档案包含超出目录的文件路径。");
    try {
      const resolved = await realpath(candidate);
      if (!resolved.startsWith(source + path.sep))
        throw new Error("档案文件不能指向目录之外。");
      if (!(await stat(resolved)).isFile()) return null;
      return resolved;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  const missing: string[] = [],
    available = new Map<
      number,
      { input: string; original: boolean; mime: string; name: string }
    >();
  for (const m of data.media as Row[]) {
    const original = await file(m.originalPath),
      optimized = await file(m.archivePath);
    if (m.originalPath && !original) missing.push(String(m.originalPath));
    if (m.archivePath && !optimized) missing.push(String(m.archivePath));
    const input = original || optimized;
    if (input)
      available.set(m.id, {
        input,
        original: !!original,
        mime: original ? m.originalMimeType || m.mimeType : m.mimeType,
        name: path.basename(
          original ? m.originalPath : m.filename || m.archivePath,
        ),
      });
  }
  const report = {
    sourceFamily: data.familyId,
    targetFamily: options.familyId,
    records: data.entries.length,
    media: data.media.length,
    projects: data.projects.length,
    missingFiles: missing,
    applied: !!options.apply,
    restoredEntries: 0,
    restoredMedia: 0,
    restoredProjects: 0,
    restoredHistory: 0,
    skippedEntries: [] as number[],
  };
  if (!options.apply) return report;
  if (missing.length && !options.allowMissing)
    throw new Error(
      `档案缺少 ${missing.length} 份文件。请先补齐，或明确使用 --allow-missing 跳过缺失素材。`,
    );
  const common = {
    overrideAccess: false as const,
    user: parent,
    context: { restoreArchive: true },
  };
  const mediaMap = new Map<number, number>(),
    projectMap = new Map<number, number>(),
    entryMap = new Map<number, number>();
  for (const [old, info] of available) {
    const original = (data.media as Row[]).find((m) => m.id === old)!;
    const bytes = await readFile(info.input);
    const m = await payload.create({
      collection: "media",
      data: {
        alt: String(original.alt || "").slice(0, 300),
        familyId: options.familyId,
      },
      file: {
        name: info.name,
        mimetype: info.mime,
        data: bytes,
        size: bytes.length,
      },
      ...common,
      context: { restoreArchive: true, restoreOriginal: info.original },
    });
    mediaMap.set(old, m.id);
    report.restoredMedia++;
  }
  for (const p of data.projects as Row[]) {
    const result = await payload.create({
      collection: "projects",
      data: {
        title: String(p.title || "恢复的成长项目"),
        summary: p.summary || "",
        description: p.description || "",
        status: p.status === "completed" ? "completed" : "exploring",
        visibility: "family",
        startedAt: p.startedAt || null,
        cover: mediaMap.get(relationId(p.cover)) || null,
        familyId: options.familyId,
        owner: author(p.owner),
      },
      ...common,
    });
    projectMap.set(p.id, result.id);
    report.restoredProjects++;
  }
  const run = createHash("sha256")
    .update(`${options.familyId}:${data.familyId}:${data.exportedAt}`)
    .digest("hex")
    .slice(0, 20);
  for (const e of data.entries as Row[]) {
    const media = (e.media || [])
      .map((id: unknown) => mediaMap.get(relationId(id)))
      .filter(Boolean) as number[];
    if (
      !String(e.content || "").trim() &&
      !media.length &&
      e.status === "saved"
    ) {
      report.skippedEntries.push(e.id);
      continue;
    }
    const clientId = `restore-${run}-${e.id}`;
    const prior = await payload.find({
      collection: "entries",
      where: { clientId: { equals: clientId } },
      limit: 1,
      depth: 0,
      ...common,
    });
    if (prior.docs[0]) {
      entryMap.set(e.id, prior.docs[0].id);
      continue;
    }
    const result = await payload.create({
      collection: "entries",
      data: {
        type: e.type,
        title: e.title || "",
        content: e.content || "",
        originalText: e.originalText ?? e.content ?? "",
        reflection: e.reflection || "",
        learning: e.learning || "",
        parentNote: e.parentNote || "",
        occurredAt: e.occurredAt || null,
        datePrecision: e.occurredAt ? e.datePrecision || "unknown" : "unknown",
        dateNote: e.dateNote || "",
        retrospective: !!e.retrospective,
        tags: (e.tags || []).map((t: Row) => ({ label: t.label })),
        media,
        coverMedia: mediaMap.get(relationId(e.coverMedia)) || null,
        projects: (e.projects || [])
          .map((p: unknown) => projectMap.get(relationId(p)))
          .filter(Boolean),
        mainProject: projectMap.get(relationId(e.mainProject)) || null,
        status: ["draft", "archived"].includes(e.status) ? e.status : "saved",
        visibility: "family",
        author: author(e.author),
        familyId: options.familyId,
        clientId,
        revision:
          Number.isSafeInteger(e.revision) && e.revision > 0 ? e.revision : 1,
        createdAt: e.createdAt,
      },
      ...common,
    });
    entryMap.set(e.id, result.id);
    report.restoredEntries++;
  }
  const versions: Row[] = [
    ...(data.history || []).map((h: Row) => ({
      entry: relationId(h.entry),
      snapshot: h.snapshot,
      revision: h.revision,
      editorName: h.editorName,
    })),
    ...(data.recentVersions || []).map((h: Row) => ({
      entry: relationId(h.parent),
      snapshot: h.version,
      revision: h.version?.revision,
      editorName: h.version?.editorName,
    })),
  ];
  for (const v of versions) {
    const id = entryMap.get(v.entry),
      s = v.snapshot;
    if (!id || !s || !Number.isSafeInteger(v.revision) || v.revision < 1)
      continue;
    const versionKey = `${id}:${v.revision}`;
    const exists = await payload.find({
      collection: "entry-history",
      where: { versionKey: { equals: versionKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (exists.docs[0]) continue;
    await payload.create({
      collection: "entry-history",
      data: {
        versionKey,
        entry: id,
        revision: v.revision,
        familyId: options.familyId,
        author: author(s.author),
        editorName: v.editorName || "备份中的家庭成员",
        snapshot: {
          ...s,
          id,
          familyId: options.familyId,
          author: author(s.author),
          visibility: "family",
          publicSnapshot: null,
          publicMedia: [],
          media: (s.media || [])
            .map((m: unknown) => mediaMap.get(relationId(m)))
            .filter(Boolean),
          coverMedia: mediaMap.get(relationId(s.coverMedia)) || null,
          projects: (s.projects || [])
            .map((p: unknown) => projectMap.get(relationId(p)))
            .filter(Boolean),
          mainProject: projectMap.get(relationId(s.mainProject)) || null,
        },
      },
      overrideAccess: true,
    });
    report.restoredHistory++;
  }
  if (data.profile) {
    const p = data.profile;
    const existing = await payload.find({
      collection: "spaces",
      where: { familyId: { equals: options.familyId } },
      limit: 1,
      depth: 0,
      ...common,
    });
    const profile = {
      displayName: p.displayName || "我的成长手记",
      bio: p.bio || "",
      interests: (p.interests || []).map((t: Row) => ({ label: t.label })),
      theme: ["usagi", "hachiware", "chiikawa"].includes(p.theme)
        ? p.theme
        : "usagi",
      modules: p.modules,
      avatar: mediaMap.get(relationId(p.avatar)) || null,
      cover: mediaMap.get(relationId(p.cover)) || null,
      owner: child.id,
      familyId: options.familyId,
    };
    if (existing.docs[0])
      await payload.update({
        collection: "spaces",
        id: existing.docs[0].id,
        data: profile,
        ...common,
      });
    else
      await payload.create({ collection: "spaces", data: profile, ...common });
  }
  return report;
}
