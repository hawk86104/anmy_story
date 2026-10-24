"use client";
import { FileText, LoaderCircle, RefreshCw } from "lucide-react";
import type { Media } from "@mylife/shared";
import { api, sizeLabel } from "@/lib/api";
import { mediaUrl } from "@/lib/urls";
export function MediaView({
  media,
  onRetry,
}: {
  media: Media;
  onRetry?: () => void;
}) {
  const url = mediaUrl(media.url);
  if (media.processingStatus !== "ready")
    return (
      <div className="media-processing">
        <LoaderCircle
          size={22}
          className={media.processingStatus === "failed" ? "" : "spin"}
        />
        <strong>
          {media.processingStatus === "failed"
            ? "视频处理遇到一点问题"
            : "视频正在整理中"}
        </strong>
        <span>
          {media.processingError || "文字已经存好，处理完成后视频会自动出现。"}
        </span>
        {media.processingStatus === "failed" && (
          <button
            className="text-button"
            onClick={async () => {
              await api(`/media/${media.id}/retry`, { method: "POST" });
              onRetry?.();
            }}
          >
            <RefreshCw size={14} />
            重新处理
          </button>
        )}
      </div>
    );
  if (media.mimeType?.startsWith("image/"))
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img
          src={url}
          crossOrigin="use-credentials"
          alt={media.alt || "成长记录照片"}
          loading="lazy"
        />
      </a>
    );
  if (media.mimeType?.startsWith("video/"))
    return (
      <video
        src={url}
        crossOrigin="use-credentials"
        controls
        playsInline
        preload="metadata"
      />
    );
  if (media.mimeType?.startsWith("audio/"))
    return (
      <div className="audio-player">
        <span>留住当时的声音</span>
        <audio
          src={url}
          crossOrigin="use-credentials"
          controls
          preload="metadata"
        />
      </div>
    );
  return (
    <a className="file-attachment" href={url} target="_blank" rel="noreferrer">
      <FileText />
      <span>
        {media.filename}
        <small>{sizeLabel(media.filesize)}</small>
      </span>
    </a>
  );
}
