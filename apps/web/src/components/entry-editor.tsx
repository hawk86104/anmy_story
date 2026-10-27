"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ImagePlus,
  Camera,
  Film,
  Mic,
  X,
  Plus,
  Sparkles,
  BookOpen,
  Palette,
  Flag,
  LockKeyhole,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Square,
  CheckCircle2,
  FileText,
  WifiOff,
  ArrowUp,
  ArrowDown,
  Star,
} from "lucide-react";
import type {
  Entry,
  EntryInput,
  Media,
  EntryType,
  DatePrecision,
  Visibility,
  GrowthProject,
} from "@mylife/shared";
import { ENTRY_TYPES, displayDate } from "@mylife/shared";
import { useSession } from "./session";
import { api, sizeLabel, ApiError } from "@/lib/api";
import { mediaUrl } from "@/lib/urls";
import { prepareImage, uploadMedia } from "@/lib/media";
import { AttachmentLibrary } from "./media-picker";
import { AIAssistant } from "./ai-assistant";
import { Usagi } from "./theme";
import {
  draftKey,
  readDraft,
  writeDraft,
  removeDraft,
  snapshotDraft,
} from "@/lib/drafts";

interface UploadItem {
  key: string;
  file?: File;
  preview?: string;
  name: string;
  status: "compressing" | "uploading" | "ready" | "failed";
  progress: number;
  media?: Media;
  error?: string;
  imageKind: string;
}
const icons = { quick: Sparkles, story: BookOpen, work: Palette, honor: Flag };
const today = () => new Date().toLocaleDateString("en-CA");
const initial = (entry?: Entry): EntryInput => ({
  type: entry?.type || "quick",
  title: entry?.title || "",
  content: entry?.content || "",
  reflection: entry?.reflection || "",
  learning: entry?.learning || "",
  parentNote: entry?.parentNote || "",
  occurredAt: entry?.occurredAt?.slice(0, 10) || today(),
  datePrecision: entry?.datePrecision || "day",
  dateNote: entry?.dateNote || "",
  retrospective: entry?.retrospective || false,
  tags: entry?.tags || [],
  media: entry?.media?.map((m) => (typeof m === "number" ? m : m.id)) || [],
  coverMedia:
    typeof entry?.coverMedia === "number"
      ? entry.coverMedia
      : entry?.coverMedia?.id || null,
  projects:
    entry?.projects?.map((p) => (typeof p === "number" ? p : p.id)) || [],
  mainProject:
    typeof entry?.mainProject === "number"
      ? entry.mainProject
      : entry?.mainProject?.id || null,
  status: "saved",
  visibility: entry?.visibility || "family",
  revision: entry?.revision,
  clientId: crypto.randomUUID(),
});
const mapMedia = (media: Media): UploadItem => ({
  key: `remote-${media.id}`,
  name: media.filename,
  status: "ready",
  progress: 100,
  media,
  imageKind: "photo",
});

export function EntryEditor({
  entry,
  onSaved,
  embedded = false,
}: {
  entry?: Entry;
  onSaved?: (entry: Entry) => void;
  embedded?: boolean;
}) {
  const { user } = useSession();
  const router = useRouter();
  const [form, setForm] = useState<EntryInput>(() => initial(entry));
  const [projects, setProjects] = useState<GrowthProject[]>([]);
  const [items, setItems] = useState<UploadItem[]>(
    () =>
      entry?.media
        ?.filter((m): m is Media => typeof m !== "number")
        .map(mapMedia) || [],
  );
  const [ready, setReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [restored, setRestored] = useState(false);
  const [sheet, setSheet] = useState<"date" | "visibility" | "voice" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);
  const [maxMB, setMaxMB] = useState(100);
  const [documentImage, setDocumentImage] = useState(entry?.type === "honor");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const inputPhoto = useRef<HTMLInputElement>(null);
  const inputCamera = useRef<HTMLInputElement>(null);
  const inputVideo = useRef<HTMLInputElement>(null);
  const inputFile = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const itemRef = useRef(items);
  const savingRef = useRef(false);
  const savedRef = useRef(false);
  const objectUrls = useRef(new Set<string>());
  const sheetRef = useRef<HTMLElement>(null);
  const storageKey = draftKey(user, entry?.id);
  const patch = <K extends keyof EntryInput>(key: K, value: EntryInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const hasContent = Boolean(
    form.title.trim() ||
    form.content.trim() ||
    form.reflection.trim() ||
    form.learning.trim() ||
    items.length,
  );
  const busy = items.some(
    (i) => i.status === "uploading" || i.status === "compressing",
  );
  const failed = items.some((i) => i.status === "failed");

  const processUpload = useCallback(async (item: UploadItem) => {
    if (!item.file) return;
    const update = (data: Partial<UploadItem>) =>
      setItems((current) =>
        current.map((i) => (i.key === item.key ? { ...i, ...data } : i)),
      );
    try {
      update({ status: "compressing", error: undefined, progress: 0 });
      const compressed = await prepareImage(
        item.file,
        item.imageKind === "document",
      );
      update({ status: "uploading" });
      const media = await uploadMedia(
        compressed,
        item.file.size,
        item.imageKind,
        (n) => update({ progress: n }),
      );
      update({ status: "ready", progress: 100, media });
    } catch (e) {
      update({
        status: "failed",
        error: e instanceof Error ? e.message : "上传未成功，请重试。",
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    readDraft(storageKey)
      .then((d) => {
        if (!active) return;
        if (
          d &&
          (!entry || new Date(d.updatedAt) > new Date(entry.updatedAt))
        ) {
          const {
            updatedAt: _at,
            remoteId: _id,
            mediaInfo,
            pendingFiles,
            ...rest
          } = d;
          setForm(rest);
          const restoredItems = (mediaInfo || []).map(mapMedia);
          const pending = (pendingFiles || []).map((p) => ({
            key: crypto.randomUUID(),
            file: p.file,
            name: p.file.name,
            status: "failed" as const,
            progress: 0,
            imageKind: p.imageKind,
            error: "上次未完成上传，点击重试。",
          }));
          setItems([...restoredItems, ...pending]);
          setRestored(true);
        } else if (!entry) {
          const requested = new URLSearchParams(location.search).get("type");
          if (ENTRY_TYPES.some((t) => t.value === requested)) {
            setForm((f) => ({ ...f, type: requested as EntryType }));
            setDocumentImage(requested === "honor");
          }
        }
      })
      .catch(() => {
        if (active) setDraftStatus("设备草稿不可用，请及时保存到家庭空间");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    api<{ maxUploadMB: number }>("/capabilities")
      .then((c) => setMaxMB(c.maxUploadMB))
      .catch(() => {});
    setOnline(navigator.onLine);
    const connected = () => setOnline(true),
      disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      active = false;
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, [storageKey, entry]);
  useEffect(() => {
    let active = true;
    api<{ docs: GrowthProject[] }>(
      "/projects?depth=0&limit=100&sort=-createdAt",
    )
      .then((r) => {
        if (!active) return;
        setProjects(r.docs);
        const id = Number(new URLSearchParams(location.search).get("project"));
        if (!entry && id && r.docs.some((p) => p.id === id))
          setForm((f) => ({
            ...f,
            projects: [...new Set([...(f.projects || []), id])],
            mainProject: f.mainProject || id,
          }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [entry?.id]);

  useEffect(() => {
    if (!sheet || !sheetRef.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const buttons = () =>
      Array.from(
        sheetRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select, textarea, a[href]",
        ) || [],
      );
    buttons()[0]?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !recording) setSheet(null);
      if (e.key !== "Tab") return;
      const list = buttons(),
        first = list[0],
        last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [sheet, recording]);
  useEffect(() => {
    itemRef.current = items;
  }, [items]);
  const latestDraft = useRef({ form, items, ready, hasContent });
  useEffect(() => {
    latestDraft.current = { form, items, ready, hasContent };
  }, [form, items, ready, hasContent]);
  useEffect(() => {
    const flush = () => {
      const current = latestDraft.current;
      if (current.ready && current.hasContent && !savedRef.current) {
        void writeDraft(
          storageKey,
          snapshotDraft(current.form, current.items),
        ).catch(() => {});
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
    };
  }, [storageKey]);
  useEffect(() => {
    if (!ready || savedRef.current) return;
    if (!hasContent) {
      void removeDraft(storageKey).catch(() => {});
      return;
    }
    const timer = setTimeout(() => {
      if (savedRef.current) return;
      writeDraft(storageKey, snapshotDraft(form, items))
        .then(() => {
          if (!savedRef.current) setDraftStatus("草稿已存于此设备");
        })
        .catch(() => setDraftStatus("设备空间不足，请及时保存草稿"));
    }, 600);
    return () => clearTimeout(timer);
  }, [form, items, ready, storageKey, hasContent]);
  useEffect(() => {
    function prevent(e: BeforeUnloadEvent) {
      if (busy || recording) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [busy, recording]);
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => {
    if (recording && seconds >= 600) recorder.current?.stop();
  }, [recording, seconds]);

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    setError("");
    const list = Array.from(files);
    if (itemRef.current.length + list.length > 12) {
      setError("一条记录最多放 12 份素材，可以分几条慢慢收藏。");
      return;
    }
    const incoming: UploadItem[] = [];
    for (const file of list) {
      if (file.size > maxMB * 1024 * 1024) {
        setError(`${file.name} 超过 ${maxMB} MB，请选择小一点的文件。`);
        continue;
      }
      if (
        !/^(image\/(jpeg|png|webp)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|x-m4a|wav|webm|ogg)|application\/pdf)$/.test(
          file.type,
        )
      ) {
        setError(
          `${file.name} 暂不支持。图片请使用 JPEG、PNG 或 WebP；也支持常见视频、音频和 PDF。`,
        );
        continue;
      }
      const preview = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
      if (preview) objectUrls.current.add(preview);
      incoming.push({
        key: crypto.randomUUID(),
        file,
        preview,
        name: file.name,
        status: "compressing",
        progress: 0,
        imageKind: documentImage ? "document" : "photo",
      });
    }
    setItems((current) => [...current, ...incoming]);
    for (const item of incoming) void processUpload(item);
  }
  function removeItem(key: string) {
    const item = itemRef.current.find((i) => i.key === key);
    if (item?.preview) {
      URL.revokeObjectURL(item.preview);
      objectUrls.current.delete(item.preview);
    }
    setItems((current) => current.filter((i) => i.key !== key));
    if (item?.media?.id === form.coverMedia) patch("coverMedia", null);
  }
  function moveItem(index: number, delta: number) {
    setItems((current) => {
      const next = [...current],
        target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  async function startRecording() {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "当前浏览器无法录音。请使用 HTTPS 打开，或选择已有音频文件。",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(
        stream.current,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        setRecording(false);
        setSheet(null);
        const blob = new Blob(chunks, { type: rec.mimeType.split(";")[0] });
        if (blob.size)
          addFiles([
            new File(
              [blob],
              `我的声音-${Date.now()}.${blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"}`,
              { type: blob.type },
            ),
          ]);
      };
      rec.start(1000);
      setSeconds(0);
      setRecording(true);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(
        e instanceof Error
          ? e.message
          : "没有取得麦克风权限，可以改为上传音频。",
      );
    }
  }
  async function save(status: "draft" | "saved") {
    if (savingRef.current) return;
    if (busy) {
      setError("素材还在上传，文字会自动留在设备草稿中。请等上传完成再保存。");
      return;
    }
    if (failed) {
      setError("还有素材上传失败。请重试，或者移除后保存，其余内容不会丢失。");
      return;
    }
    if (
      status === "saved" &&
      !form.content.trim() &&
      !items.some((i) => i.media)
    ) {
      setError("写一句话，或者放一张照片，让这一刻留下来吧。");
      return;
    }
    if (!hasContent) {
      setError("先留下你想记录的一点内容吧。");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    const data = {
      ...form,
      media: items.flatMap((i) => (i.media ? [i.media.id] : [])),
      status,
    };
    if (data.datePrecision === "unknown") data.occurredAt = null;
    else if (data.occurredAt)
      data.occurredAt = `${data.occurredAt.slice(0, 10)}T00:00:00.000Z`;
    try {
      let result: { doc: Entry };
      try {
        result = await api<{ doc: Entry }>(
          entry ? `/entries/${entry.id}` : "/entries",
          { method: entry ? "PATCH" : "POST", body: JSON.stringify(data) },
        );
      } catch (e) {
        // If an acknowledgement was lost, recover the existing document rather than duplicate it.
        if (
          entry ||
          !(e instanceof ApiError) ||
          e.status === 401 ||
          e.status === 403
        )
          throw e;
        const previous = await api<{ docs: Entry[] }>(
          `/entries?where[clientId][equals]=${encodeURIComponent(form.clientId)}&depth=1`,
        );
        if (!previous.docs[0]) throw e;
        result = await api<{ doc: Entry }>(`/entries/${previous.docs[0].id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...data,
            revision: previous.docs[0].revision,
          }),
        });
      }
      savedRef.current = true;
      await removeDraft(storageKey).catch(() => {});
      if (onSaved) onSaved(result.doc);
      else router.replace(`/app/entries/${result.doc.id}?saved=1`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "还没有保存成功，草稿仍在此设备。",
      );
      setSaving(false);
      savingRef.current = false;
    }
  }

  if (!ready)
    return (
      <div className="page-content">
        <p className="muted">正在打开你的手记…</p>
      </div>
    );
  const placeholders: Record<EntryType, string> = {
    quick:
      "今天有什么想留住的小事？\n一件开心的事，一个新发现，\n或者只是此刻的心情…",
    story: "从“那天…”开始，慢慢讲给未来的自己听。\n发生了什么？你又做了什么？",
    work: "这是一个怎样的作品？\n写下你的灵感、尝试，或是最喜欢的细节。",
    honor:
      "今天的你，又迈出了哪一小步？\n第一次完成、坚持很久、勇敢尝试，都值得记住。",
  };
  const Root = embedded ? "section" : "main";
  return (
    <Root
      className={
        embedded ? "editor-page embedded-editor" : "page-content editor-page"
      }
    >
      <div className="editor-heading">
        <div>
          <span className="eyebrow">COLLECT A LITTLE MOMENT</span>
          <h1>
            {entry ? "继续写这段记忆" : "记一件小事"}
            <span className="heading-star">✳</span>
          </h1>
          <p>不用写得很厉害，真实就很好。</p>
        </div>
        <span className="draft-indicator">
          <CheckCheck size={15} />
          {draftStatus || "你的表达，慢慢来"}
        </span>
      </div>
      {!online && (
        <div className="notice-banner">
          <WifiOff size={17} />
          你暂时离线了，可以继续写；联网后再保存到家庭空间。
        </div>
      )}
      {restored && (
        <div className="notice-banner">
          <CheckCircle2 size={17} />
          已经接上你上次没写完的故事。
          <button onClick={() => setRestored(false)} aria-label="关闭提示">
            <X size={15} />
          </button>
        </div>
      )}
      <div className="editor-columns">
        <div className="editor-main">
          <section className="editor-card">
            <div className="mode-switch" role="tablist" aria-label="记录方式">
              {ENTRY_TYPES.map((t) => {
                const Icon = icons[t.value];
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="tab"
                    aria-selected={form.type === t.value}
                    className={form.type === t.value ? "selected" : ""}
                    onClick={() => {
                      patch("type", t.value);
                      setDocumentImage(t.value === "honor");
                    }}
                  >
                    <Icon size={18} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="writing-area">
              <div className="entry-meta">
                <button className="date-chip" onClick={() => setSheet("date")}>
                  <CalendarDays size={15} />
                  {displayDate({ ...form, occurredAt: form.occurredAt })}
                  <ChevronDown size={13} />
                </button>
                {form.retrospective && (
                  <span className="retrospective-tag">回忆补录</span>
                )}
                <span className="mode-hint">
                  {ENTRY_TYPES.find((t) => t.value === form.type)?.description}
                </span>
              </div>
              <input
                className="entry-title-input"
                aria-label="记录标题"
                value={form.title}
                maxLength={160}
                onChange={(e) => patch("title", e.target.value)}
                placeholder={
                  form.type === "quick"
                    ? "给这一刻起个名字（选填）"
                    : form.type === "work"
                      ? "作品的名字"
                      : form.type === "honor"
                        ? "值得纪念的小里程碑"
                        : "故事的名字（选填）"
                }
              />
              <textarea
                className="entry-body-input"
                aria-label="记录正文"
                value={form.content}
                maxLength={50000}
                onChange={(e) => patch("content", e.target.value)}
                placeholder={placeholders[form.type]}
              />
              <div className="writing-bottom">
                <span>每一句，都是你的独家记忆</span>
                <span>{form.content.length} 字</span>
              </div>
              {form.type !== "quick" && (
                <div className="story-extras">
                  <label>
                    {form.type === "work"
                      ? "创作时的小心思"
                      : "那时候，我觉得…"}
                    <textarea
                      value={form.reflection}
                      maxLength={10000}
                      onChange={(e) => patch("reflection", e.target.value)}
                      placeholder="开心、紧张，还是有点小遗憾？都可以。"
                    />
                  </label>
                  <label>
                    我的小小收获
                    <textarea
                      value={form.learning}
                      maxLength={10000}
                      onChange={(e) => patch("learning", e.target.value)}
                      placeholder="留下一个发现、一点进步，或想继续尝试的事。"
                    />
                  </label>
                </div>
              )}
              {user.role === "parent" && (
                <div className="story-extras">
                  <label>
                    家长的小小补充
                    <textarea
                      value={form.parentNote || ""}
                      maxLength={10000}
                      onChange={(e) => patch("parentNote", e.target.value)}
                      placeholder="补充当时的背景，保留孩子自己的表达。"
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="attachment-area">
              <div className="attachment-heading">
                <h2>
                  让记忆更生动<span>照片、视频，或当时的声音</span>
                </h2>
                <small>{items.length} / 12</small>
              </div>
              {items.length > 0 && (
                <div className="upload-grid">
                  {items.map((item, i) => (
                    <div
                      className={`upload-tile ${item.status === "failed" ? "upload-failed" : ""}`}
                      key={item.key}
                    >
                      {item.preview ||
                      item.media?.mimeType?.startsWith("image/") ? (
                        <img
                          src={item.preview || mediaUrl(item.media?.url)}
                          crossOrigin="use-credentials"
                          alt={`素材 ${i + 1}`}
                        />
                      ) : (
                        <div className="upload-icon">
                          {(
                            item.file?.type ||
                            item.media?.mimeType ||
                            ""
                          ).startsWith("video/") ? (
                            <Film size={29} />
                          ) : (
                              item.file?.type ||
                              item.media?.mimeType ||
                              ""
                            ).startsWith("audio/") ? (
                            <Mic size={29} />
                          ) : (
                            <FileText size={29} />
                          )}
                        </div>
                      )}
                      <button
                        className="remove-media"
                        onClick={() => removeItem(item.key)}
                        aria-label={`移除 ${item.name}`}
                      >
                        <X size={13} />
                      </button>
                      {item.status === "ready" && (
                        <div className="upload-order">
                          <button
                            type="button"
                            aria-label={`把素材 ${i + 1} 前移`}
                            disabled={i === 0}
                            onClick={() => moveItem(i, -1)}
                          >
                            <ArrowUp size={15} />
                          </button>
                          {item.media?.mimeType?.startsWith("image/") && (
                            <button
                              type="button"
                              className={
                                form.coverMedia === item.media.id
                                  ? "cover-selected"
                                  : ""
                              }
                              aria-label={
                                form.coverMedia === item.media.id
                                  ? "取消记录封面"
                                  : "设为记录封面"
                              }
                              aria-pressed={form.coverMedia === item.media.id}
                              onClick={() =>
                                patch(
                                  "coverMedia",
                                  form.coverMedia === item.media?.id
                                    ? null
                                    : item.media!.id,
                                )
                              }
                            >
                              <Star size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`把素材 ${i + 1} 后移`}
                            disabled={i === items.length - 1}
                            onClick={() => moveItem(i, 1)}
                          >
                            <ArrowDown size={15} />
                          </button>
                        </div>
                      )}
                      <div className="upload-overlay">
                        {item.status === "compressing" ? (
                          <>
                            <LoaderCircle size={13} className="spin" />
                            整理中
                          </>
                        ) : item.status === "uploading" ? (
                          <>
                            <LoaderCircle size={13} className="spin" />
                            上传 {item.progress}%
                          </>
                        ) : item.status === "failed" ? (
                          <button
                            title={item.error}
                            onClick={() => void processUpload(item)}
                          >
                            <RefreshCw size={13} />
                            点击重试
                          </button>
                        ) : (
                          <>
                            <Check size={13} />
                            {item.media?.processingStatus === "queued" ||
                            item.media?.processingStatus === "processing"
                              ? "视频处理中"
                              : item.media
                                ? sizeLabel(item.media.filesize)
                                : "已上传"}
                          </>
                        )}
                      </div>
                      {item.status === "uploading" && (
                        <div
                          className="upload-progress"
                          style={{ width: `${item.progress}%` }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {items
                .filter((i) => i.status === "failed")
                .map((i) => (
                  <p key={i.key} className="upload-error">
                    {i.name}：{i.error}
                  </p>
                ))}
              <div
                className={`media-actions ${items.length ? "has-items" : ""}`}
              >
                <button onClick={() => inputPhoto.current?.click()}>
                  <ImagePlus size={23} strokeWidth={1.5} />
                  <strong>加照片</strong>
                  <small>留住眼前的小美好</small>
                </button>
                <button onClick={() => inputVideo.current?.click()}>
                  <Film size={23} strokeWidth={1.5} />
                  <strong>放视频</strong>
                  <small>收藏会动的记忆</small>
                </button>
                <button onClick={() => setSheet("voice")}>
                  <Mic size={23} strokeWidth={1.5} />
                  <strong>说几句</strong>
                  <small>听听此刻的自己</small>
                </button>
                <button onClick={() => inputCamera.current?.click()}>
                  <Camera size={23} strokeWidth={1.5} />
                  <strong>拍一张</strong>
                  <small>就把这一刻留下</small>
                </button>
              </div>
              <div className="media-footnote">
                <span>
                  <CheckCircle2 size={13} />
                  照片自动优化，视频后台处理
                </span>
                <button onClick={() => inputFile.current?.click()}>
                  添加附件
                  <Plus size={12} />
                </button>
              </div>
              <label className="image-quality-option">
                <input
                  type="checkbox"
                  checked={documentImage}
                  onChange={(e) => setDocumentImage(e.target.checked)}
                />
                这次有证书或文字图片，优先保留清晰度
              </label>
              <AttachmentLibrary
                selectedIds={items.flatMap((i) =>
                  i.media ? [i.media.id] : [],
                )}
                onSelect={(media) => {
                  if (
                    items.length < 12 &&
                    !items.some((i) => i.media?.id === media.id)
                  )
                    setItems((list) => [...list, mapMedia(media)]);
                }}
              />
            </div>
          </section>
          <section className="project-editor-fields">
            <label>
              放进哪个成长项目？
              <small className="muted">
                可以关联多个项目，公开范围仍由每条记录分别决定。
              </small>
            </label>
            {projects.length ? (
              <>
                <div className="project-selector">
                  {projects.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className={
                        form.projects?.includes(p.id) ? "selected" : ""
                      }
                      aria-pressed={form.projects?.includes(p.id) || false}
                      onClick={() =>
                        setForm((f) => {
                          const selected = f.projects || [];
                          const next = selected.includes(p.id)
                            ? selected.filter((id) => id !== p.id)
                            : [...selected, p.id].slice(0, 8);
                          return {
                            ...f,
                            projects: next,
                            mainProject: next.includes(f.mainProject || 0)
                              ? f.mainProject
                              : next[0] || null,
                          };
                        })
                      }
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
                {Boolean(form.projects?.length) && (
                  <label>
                    主要项目
                    <select
                      value={form.mainProject || ""}
                      onChange={(e) =>
                        patch("mainProject", Number(e.target.value) || null)
                      }
                    >
                      <option value="">不单独指定</option>
                      {projects
                        .filter((p) => form.projects?.includes(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <p className="muted">一个小计划，可以把相关的记忆串在一起。</p>
            )}
            <Link
              className="text-button"
              href="/app/projects/new"
              target="_blank"
            >
              <Plus size={15} />
              建立一个新的小计划
            </Link>
          </section>
          <AIAssistant
            title={form.title}
            content={form.content}
            clientId={form.clientId}
            audio={items.flatMap((i) =>
              i.media?.mimeType?.startsWith("audio/") ? [i.media] : [],
            )}
            onApply={(title, content, token) =>
              setForm((f) => ({
                ...f,
                title,
                content,
                ...(token
                  ? { aiOriginalToken: f.aiOriginalToken || token }
                  : {}),
              }))
            }
          />
          <div className="optional-tags">
            <span>给这段记忆贴个小标签</span>
            <div>
              {[
                "日常小事",
                "新的尝试",
                "我的作品",
                "运动一下",
                "读书时光",
                "小小进步",
              ].map((label) => (
                <button
                  key={label}
                  className={
                    form.tags.some((t) => t.label === label)
                      ? "tag selected"
                      : "tag"
                  }
                  onClick={() =>
                    patch(
                      "tags",
                      form.tags.some((t) => t.label === label)
                        ? form.tags.filter((t) => t.label !== label)
                        : [...form.tags, { label }].slice(0, 8),
                    )
                  }
                >
                  {form.tags.some((t) => t.label === label) && (
                    <Check size={12} />
                  )}
                  {label}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <div className="editor-submit">
            <div className="visibility-control">
              <button onClick={() => setSheet("visibility")}>
                {form.visibility === "family" ? (
                  <LockKeyhole size={16} />
                ) : (
                  <Globe2 size={16} />
                )}
                <span>
                  {form.visibility === "family"
                    ? "仅自己和家长可见"
                    : "所有人可见"}
                </span>
                <ChevronDown size={13} />
              </button>
              <small>
                {form.visibility === "family"
                  ? "只有你和家长可以查看"
                  : "保存后直接公开，游客也能查看"}
              </small>
            </div>
            <div className="submit-buttons">
              <button
                className="draft-button"
                disabled={saving || busy || !online}
                onClick={() => void save("draft")}
              >
                存草稿
              </button>
              <button
                className="primary-button"
                disabled={saving || busy || !online}
                onClick={() => void save("saved")}
              >
                {saving ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Check size={17} />
                )}
                {saving ? "正在收藏…" : entry ? "保存这次修改" : "存下这一刻"}
                {!saving && <ArrowRight size={17} />}
              </button>
            </div>
          </div>
        </div>
        <aside className="editor-aside">
          <div className="little-note">
            <span className="note-pin" />
            <span className="eyebrow">A NOTE FOR YOU</span>
            <Usagi size={120} />
            <h3>小事，也闪闪发光。</h3>
            <p>
              不必是获奖，不必是第一名。
              <br />
              终于学会系的鞋带，
              <br />
              第一次独立做的晚饭，
              <br />
              或是没放弃的那一次。
            </p>
            <p>
              未来的你，会很喜欢
              <br />
              现在认真生活的自己。
            </p>
            <span className="note-signature">写给正在长大的你 ↗</span>
          </div>
          <div className="aside-privacy">
            <LockKeyhole size={18} />
            <div>
              <strong>这是你安心记录的地方</strong>
              <p>
                记录默认只对你和家长可见。
                <br />
                保存以后，也能随时修改。
              </p>
            </div>
          </div>
          <Link className="back-to-timeline" href="/app/entries">
            <ArrowLeft size={15} />
            翻翻之前的记忆
          </Link>
        </aside>
      </div>
      <input
        hidden
        ref={inputPhoto}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={inputCamera}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={inputVideo}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        multiple
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={inputFile}
        type="file"
        accept="application/pdf,audio/*"
        multiple
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {sheet && (
        <div
          className="sheet-backdrop"
          onClick={() => {
            if (!recording) setSheet(null);
          }}
        >
          <section
            ref={sheetRef}
            className="bottom-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <h2 id="sheet-title">
                {sheet === "date"
                  ? "这件事，发生在什么时候？"
                  : sheet === "visibility"
                    ? "想把这段记忆分享给谁？"
                    : "把此刻的声音留下来"}
              </h2>
              <button
                aria-label="关闭"
                disabled={recording}
                onClick={() => setSheet(null)}
              >
                <X size={20} />
              </button>
            </div>
            {sheet === "date" && (
              <>
                <p className="muted">
                  以前的事也可以慢慢补记，不记得准确日期也没关系。
                </p>
                <div className="precision-options">
                  {(
                    [
                      { value: "day", label: "具体日期" },
                      { value: "month", label: "记得月份" },
                      { value: "year", label: "记得年份" },
                      { value: "unknown", label: "不太确定" },
                    ] as { value: DatePrecision; label: string }[]
                  ).map((p) => (
                    <button
                      key={p.value}
                      className={
                        form.datePrecision === p.value ? "selected" : ""
                      }
                      onClick={() => patch("datePrecision", p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {form.datePrecision === "day" && (
                  <label>
                    发生日期
                    <input
                      aria-label="发生日期"
                      type="date"
                      max={today()}
                      value={form.occurredAt?.slice(0, 10) || ""}
                      onChange={(e) => patch("occurredAt", e.target.value)}
                    />
                  </label>
                )}
                {form.datePrecision === "month" && (
                  <label>
                    发生月份
                    <input
                      aria-label="发生月份"
                      type="month"
                      max={today().slice(0, 7)}
                      value={form.occurredAt?.slice(0, 7) || ""}
                      onChange={(e) =>
                        patch("occurredAt", `${e.target.value}-01`)
                      }
                    />
                  </label>
                )}
                {form.datePrecision === "year" && (
                  <label>
                    发生年份
                    <input
                      aria-label="发生年份"
                      type="number"
                      min={1900}
                      max={new Date().getFullYear()}
                      value={form.occurredAt?.slice(0, 4) || ""}
                      onChange={(e) =>
                        patch(
                          "occurredAt",
                          `${e.target.value.padStart(4, "0")}-01-01`,
                        )
                      }
                    />
                  </label>
                )}
                {form.datePrecision === "unknown" && (
                  <label>
                    关于时间的印象
                    <input
                      value={form.dateNote}
                      onChange={(e) => patch("dateNote", e.target.value)}
                      maxLength={200}
                      placeholder="比如：小学三年级的暑假"
                    />
                  </label>
                )}
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.retrospective}
                    onChange={(e) => patch("retrospective", e.target.checked)}
                  />
                  这是我补记的一段回忆
                </label>
                <button
                  className="primary-button"
                  onClick={() => setSheet(null)}
                >
                  就是这个时候
                  <Check size={17} />
                </button>
              </>
            )}
            {sheet === "visibility" && (
              <>
                <p className="muted">先留住记录，以后也能随时调整。</p>
                {(
                  [
                    {
                      value: "family",
                      title: "仅自己和家长可见",
                      description: "只有你和已加入的家长可以查看",
                      Icon: LockKeyhole,
                    },
                    {
                      value: "public",
                      title: "所有人可见",
                      description:
                        "保存后直接公开，所有人（包括未登录的游客）都能查看",
                      Icon: Globe2,
                    },
                  ] as const
                ).map((v) => (
                  <button
                    className={`visibility-option ${form.visibility === v.value ? "selected" : ""}`}
                    key={v.value}
                    onClick={() => patch("visibility", v.value as Visibility)}
                  >
                    <v.Icon size={23} />
                    <span>
                      <strong>{v.title}</strong>
                      <small>{v.description}</small>
                    </span>
                    {form.visibility === v.value && <CheckCircle2 size={20} />}
                  </button>
                ))}
                <button
                  className="primary-button"
                  onClick={() => setSheet(null)}
                >
                  选好了
                  <Check size={17} />
                </button>
              </>
            )}
            {sheet === "voice" && (
              <div className="voice-sheet">
                {error && (
                  <p className="error-box" role="alert">
                    {error}
                  </p>
                )}
                <p className="muted">
                  说一说今天的小故事，声音也是珍贵的记忆。
                </p>
                <div
                  className={`record-button ${recording ? "recording" : ""}`}
                >
                  <Mic size={42} strokeWidth={1.3} />
                </div>
                <strong>
                  {recording
                    ? `${Math.floor(seconds / 60)
                        .toString()
                        .padStart(
                          2,
                          "0",
                        )}:${(seconds % 60).toString().padStart(2, "0")}`
                    : "准备好就开始吧"}
                </strong>
                <small>
                  {recording
                    ? "最多录制 10 分钟，结束后自动上传"
                    : "只在你开始录制时使用麦克风"}
                </small>
                <button
                  className="primary-button"
                  onClick={() =>
                    recording ? recorder.current?.stop() : void startRecording()
                  }
                >
                  {recording ? <Square size={16} /> : <Mic size={16} />}
                  {recording ? "说好了，保存录音" : "开始录音"}
                </button>
                {!recording && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setSheet(null);
                      inputFile.current?.click();
                    }}
                  >
                    选择已有音频文件
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </Root>
  );
}
