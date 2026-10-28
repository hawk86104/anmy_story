"use client";
import { useState } from "react";
import { ImagePlus, Images, X } from "lucide-react";
import type { Media } from "@mylife/shared";
import { api } from "@/lib/api";
import { prepareImage, uploadMedia } from "@/lib/media";
import { mediaUrl } from "@/lib/urls";
import { useSession } from "./session";

export function MediaPicker({
  value,
  onChange,
  label,
  hint,
}: {
  value?: Media | null;
  onChange: (m: Media | null) => void;
  label: string;
  hint?: string;
}) {
  const { user } = useSession();
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [library, setLibrary] = useState<Media[] | null>(null),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false);
  async function openLibrary(next = 1) {
    setBusy(true);
    setError("");
    try {
      const p = new URLSearchParams({
        "where[familyId][equals]": user.familyId,
        "where[mimeType][like]": "image/",
        limit: "24",
        page: String(next),
        depth: "0",
        sort: "-createdAt",
      });
      const r = await api<{ docs: Media[]; hasNextPage: boolean }>(
        `/media?${p}`,
      );
      setLibrary((old) => (next === 1 ? r.docs : [...(old || []), ...r.docs]));
      setPage(next);
      setMore(r.hasNextPage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type))
        throw Error("请选择 JPEG、PNG 或 WebP 图片。");
      if (file.size > 100 * 1024 * 1024)
        throw Error("图片超过 100 MB，请选择小一点的文件。");
      const image = await prepareImage(file, false);
      const m = await uploadMedia(image, file.size, "photo", setProgress);
      onChange(m);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="media-picker">
      <span className="field-label">{label}</span>
      <div className="profile-image-row">
        {value && <img src={mediaUrl(value.url)} alt={value.alt || label} />}
        <label className="secondary-button">
          <ImagePlus size={17} />
          {busy ? `处理中 ${progress}%` : "上传照片"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => void openLibrary()}
        >
          <Images size={17} />
          素材库
        </button>
        {value && (
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => onChange(null)}
          >
            <X size={15} />
            移除
          </button>
        )}
      </div>
      {hint && <small>{hint}</small>}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {library && (
        <div className="picker-library">
          <div className="settings-actions">
            <strong>选择已有照片</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => setLibrary(null)}
            >
              关闭
            </button>
          </div>
          {library.length ? (
            <div className="picker-grid">
              {library.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => {
                    onChange(m);
                    setLibrary(null);
                  }}
                  aria-label={`选择 ${m.alt || m.filename}`}
                >
                  <img
                    src={mediaUrl(m.url)}
                    alt={m.alt || m.filename}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">这里还没有可用的照片，可以先上传一张。</p>
          )}
          {more && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void openLibrary(page + 1)}
            >
              再看看更多照片
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AttachmentLibrary({
  selectedIds,
  onSelect,
}: {
  selectedIds: number[];
  onSelect: (media: Media) => void;
}) {
  const { user } = useSession();
  const [rows, setRows] = useState<Media[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false);
  async function load(next = 1) {
    setBusy(true);
    setError("");
    try {
      const p = new URLSearchParams({
        "where[familyId][equals]": user.familyId,
        sort: "-createdAt",
        depth: "0",
        limit: "24",
        page: String(next),
      });
      const r = await api<{ docs: Media[]; hasNextPage: boolean }>(
        `/media?${p}`,
      );
      setRows((old) => (next === 1 ? r.docs : [...(old || []), ...r.docs]));
      setPage(next);
      setMore(r.hasNextPage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="attachment-library">
      <button
        type="button"
        className="text-button"
        disabled={busy || selectedIds.length >= 12}
        onClick={() => void load()}
      >
        <Images size={16} />
        从已上传的素材中选择
      </button>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {rows && (
        <div className="picker-library">
          <div className="settings-actions">
            <strong>已有的照片与声音</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => setRows(null)}
            >
              收起
            </button>
          </div>
          {rows.length ? (
            <div className="picker-grid">
              {rows.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  disabled={
                    selectedIds.includes(m.id) || selectedIds.length >= 12
                  }
                  onClick={() => onSelect(m)}
                  aria-label={`添加 ${m.alt || m.filename}`}
                >
                  {m.mimeType.startsWith("image/") ? (
                    <img
                      src={mediaUrl(m.url)}
                      alt={m.alt || m.filename}
                      loading="lazy"
                    />
                  ) : (
                    <span>
                      {m.mimeType.startsWith("audio/")
                        ? "声音"
                        : m.mimeType.startsWith("video/")
                          ? "视频"
                          : "文件"}
                      <small>{m.alt || m.filename}</small>
                    </span>
                  )}
                  {selectedIds.includes(m.id) && <strong>已添加</strong>}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">
              还没有可复用的素材，先上传一份喜欢的记忆吧。
            </p>
          )}
          {more && (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => void load(page + 1)}
            >
              加载更多
            </button>
          )}
        </div>
      )}
    </div>
  );
}
