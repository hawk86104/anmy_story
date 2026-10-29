import path from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { APIError, type Payload, type PayloadRequest } from "payload";
import { relationId } from "./access";
import { randomBytes } from "node:crypto";
import { encryptServiceKey } from "./ai";

type Row = Record<string, any>;
export async function restoreFamilyArchive(
  payload: Payload,
  options: {
    source: string;
    familyId: string;
    apply?: boolean;
    allowMissing?: boolean;
    full?: boolean;
    req?: PayloadRequest;
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
  if (options.full && data.scope !== "full-family")
    throw new APIError(
      "此为旧版增量档案，请使用命令行恢复；整体还原需要新版完整备份。",
      400,
    );
  for (const name of [
    "entries",
    "media",
    "projects",
    "members",
    "history",
    "recentVersions",
  ]) {
    if (!Array.isArray(data[name])) throw new APIError("备份索引不完整。", 400);
    const ids = new Set<number>();
    for (const row of data[name]) {
      if (
        !row ||
        !Number.isSafeInteger(row.id) ||
        row.id < 1 ||
        ids.has(row.id)
      )
        throw new APIError("备份索引包含无效或重复编号。", 400);
      ids.add(row.id);
    }
  }
  const has = (name: string, id: unknown) =>
    id === null ||
    id === undefined ||
    id === 0 ||
    (Number.isSafeInteger(relationId(id)) &&
      relationId(id) > 0 &&
      data[name].some((row: Row) => row.id === relationId(id)));
  for (const entry of data.entries as Row[]) {
    if (
      !has("members", entry.author) ||
      !has("media", entry.coverMedia) ||
      !has("projects", entry.mainProject) ||
      !(entry.media || []).every((id: unknown) => has("media", id)) ||
      !(entry.projects || []).every((id: unknown) => has("projects", id))
    )
      throw new APIError("备份中的记录关联不完整。", 400);
  }
  for (const project of data.projects as Row[])
    if (!has("media", project.cover) || !has("members", project.owner))
      throw new APIError("备份中的项目关联不完整。", 400);
  if (
    data.profile &&
    (!has("media", data.profile.avatar) || !has("media", data.profile.cover))
  )
    throw new APIError("备份中的主页图片不完整。", 400);
  const users = await payload.find({
    collection: "users",
    where: { familyId: { equals: options.familyId } },
    pagination: false,
    limit: 0,
    depth: 0,
    overrideAccess: true,
    req: options.req,
  });
  const parent =
    users.docs.find(
      (u) => u.role === "parent" && u.id === options.req?.user?.id,
    ) || users.docs.find((u) => u.role === "parent");
  if (!parent) throw new Error("目标家庭还没有家长账号，请先建立账号。");
  const child = users.docs.find((u) => u.role === "child") || parent;
  const userMap = new Map<number, number>();
  const author = (old: unknown) => {
    const original = (data.members as Row[]).find(
      (m) => m.id === relationId(old),
    );
    return (
      userMap.get(relationId(old)) ||
      users.docs.find((m) => m.email === original?.email)?.id ||
      child.id
    );
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
    if (options.full && (!m.filename || !m.archivePath))
      throw new APIError("备份缺少素材文件索引。", 400);
    const original = await file(m.originalPath),
      optimized = await file(m.archivePath);
    if (m.originalPath && !original) missing.push(String(m.originalPath));
    if (m.archivePath && !optimized) missing.push(String(m.archivePath));
    if (options.full && m.archivePath && optimized) {
      if (
        !/^[a-f0-9]{64}$/.test(m.sha256 || "") ||
        createHash("sha256")
          .update(await readFile(optimized))
          .digest("hex") !== m.sha256
      )
        throw new APIError("备份附件的完整性校验未通过。", 400);
    }
    if (options.full && m.originalPath && original) {
      if (
        !/^[a-f0-9]{64}$/.test(m.originalSha256 || "") ||
        createHash("sha256")
          .update(await readFile(original))
          .digest("hex") !== m.originalSha256
      )
        throw new APIError("备份原件的完整性校验未通过。", 400);
    }
    const input = options.full ? optimized : original || optimized;
    if (input)
      available.set(m.id, {
        input,
        original: !options.full && !!original,
        mime:
          !options.full && original
            ? m.originalMimeType || m.mimeType
            : m.mimeType,
        name: path.basename(
          !options.full && original
            ? m.originalPath
            : m.filename || m.archivePath,
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
    restoredMembers: 0,
    settings: !!data.settings,
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
    req: options.req,
  };
  if (options.full) {
    for (const old of data.members as Row[]) {
      let account = users.docs.find((u) => u.email === old.email);
      if (!account) {
        account = await payload.create({
          collection: "users",
          data: {
            name: String(old.name || "家庭成员").slice(0, 60),
            email: old.email,
            password: randomBytes(32).toString("base64url"),
            role: old.role === "parent" ? "parent" : "child",
            familyId: options.familyId,
            allowPublicPublishing: !!old.allowPublicPublishing,
          },
          overrideAccess: true,
          context: { bootstrap: true },
          req: options.req,
        });
        users.docs.push(account);
        report.restoredMembers++;
      } else {
        await payload.update({
          collection: "users",
          id: account.id,
          data: {
            name: String(old.name || account.name).slice(0, 60),
            ...(account.id === parent.id
              ? {}
              : {
                  role:
                    old.role === "parent"
                      ? ("parent" as const)
                      : ("child" as const),
                }),
            allowPublicPublishing: !!old.allowPublicPublishing,
          },
          ...common,
        });
      }
      userMap.set(old.id, account.id);
    }
  }
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
        createdAt: original.createdAt,
        imageKind: original.imageKind || "photo",
        originalSize: original.originalSize || bytes.length,
      },
      file: {
        name: info.name,
        mimetype: info.mime,
        data: bytes,
        size: bytes.length,
      },
      ...common,
      context: {
        restoreArchive: true,
        restoreOriginal: info.original,
        restoreMediaOwner: author(original.owner),
        restoreMediaPrefix: original.prefix,
        restoredMediaStatus: ["queued", "processing"].includes(
          original.processingStatus,
        )
          ? "queued"
          : original.processingStatus === "failed"
            ? "failed"
            : "ready",
        restoredMediaError: original.processingError,
        restoredOriginal:
          options.full && original.originalPath
            ? {
                data: await readFile((await file(original.originalPath))!),
                name: path.basename(original.originalPath),
                mimeType:
                  original.originalMimeType || "application/octet-stream",
              }
            : undefined,
      },
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
        visibility:
          options.full && p.visibility === "public" ? "public" : "family",
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
        visibility:
          options.full && e.visibility === "public" ? "public" : "family",
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
      createdAt: h.createdAt,
    })),
    ...(data.recentVersions || []).map((h: Row) => ({
      entry: relationId(h.parent),
      snapshot: h.version,
      revision: h.version?.revision,
      editorName: h.version?.editorName,
      createdAt: h.createdAt,
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
      req: options.req,
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
        createdAt: v.createdAt,
        snapshot: {
          ...s,
          id,
          familyId: options.familyId,
          author: author(s.author),
          visibility: options.full ? s.visibility : "family",
          publicSnapshot:
            options.full && s.publicSnapshot
              ? {
                  ...s.publicSnapshot,
                  id,
                  media: (s.publicSnapshot.media || [])
                    .map((m: unknown) => mediaMap.get(relationId(m)))
                    .filter(Boolean),
                  coverMedia:
                    mediaMap.get(relationId(s.publicSnapshot.coverMedia)) ||
                    null,
                  projects: (s.publicSnapshot.projects || [])
                    .map((p: unknown) => projectMap.get(relationId(p)))
                    .filter(Boolean),
                  mainProject:
                    projectMap.get(relationId(s.publicSnapshot.mainProject)) ||
                    null,
                }
              : null,
          publicMedia: options.full
            ? (s.publicMedia || [])
                .map((m: unknown) => mediaMap.get(relationId(m)))
                .filter(Boolean)
            : [],
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
      req: options.req,
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
      ...(Array.isArray(p.entryTagOptions)
        ? { entryTagOptions: p.entryTagOptions }
        : {}),
      theme: ["usagi", "hachiware", "chiikawa"].includes(p.theme)
        ? p.theme
        : "usagi",
      modules: p.modules,
      avatar: mediaMap.get(relationId(p.avatar)) || null,
      cover: mediaMap.get(relationId(p.cover)) || null,
      owner: options.full ? author(p.owner) : child.id,
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
  if (options.full && data.settings) {
    const s = data.settings;
    await payload.create({
      collection: "family-services",
      data: {
        familyId: options.familyId,
        enabled: !!s.enabled,
        endpoint: s.endpoint || "",
        model: s.model || "",
        transcriptionModel: s.transcriptionModel || "",
        consent: !!s.consent,
        consentAt: s.consentAt || null,
        preserveOriginals: !!s.preserveOriginals,
        lastExportAt: s.lastExportAt || null,
        keyCipher: s.apiKey
          ? encryptServiceKey(String(s.apiKey), options.familyId)
          : null,
      },
      ...common,
      overrideAccess: true,
      context: { serviceSettings: true },
    });
  }
  return report;
}
