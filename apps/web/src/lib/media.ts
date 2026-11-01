import type { Media } from "@mylife/shared";
import { api, ApiError } from "./api";
import { apiUrl } from "./urls";

export const IMAGE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.jpg,.jpeg,.jpe,.jfif,.png,.webp,.gif,.avif,.heic,.heif";
export const VIDEO_ACCEPT =
  "video/mp4,video/quicktime,video/webm,video/matroska,video/x-matroska,video/vnd.avi,video/x-msvideo,video/3gpp,.mp4,.m4v,.mov,.webm,.mkv,.avi,.3gp";
export const OTHER_MEDIA_ACCEPT =
  "application/pdf,audio/*,.pdf,.mp3,.m4a,.wav,.wave,.ogg,.oga,.opus";

const extensionTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/matroska",
  avi: "video/vnd.avi",
  "3gp": "video/3gpp",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  wave: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  pdf: "application/pdf",
};
const typeAliases: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "video/x-m4v": "video/mp4",
  "audio/mp3": "audio/mpeg",
  "video/x-matroska": "video/matroska",
  "video/x-msvideo": "video/vnd.avi",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "application/x-pdf": "application/pdf",
};
const supportedTypes = new Set([
  ...Object.values(extensionTypes),
  "audio/x-m4a",
  "audio/webm",
  "image/heic-sequence",
  "image/heif-sequence",
]);

export function mediaFileType(file: Pick<File, "name" | "type">) {
  const declared = file.type.split(";", 1)[0].trim().toLowerCase();
  const normalized = typeAliases[declared] || declared;
  const extension = file.name.includes(".")
    ? file.name.toLowerCase().split(".").pop() || ""
    : "";
  // Do not flatten GIF animation when a browser reports the wrong image type.
  if (["gif", "avif", "heic", "heif"].includes(extension))
    return extensionTypes[extension];
  if (supportedTypes.has(normalized)) return normalized;
  return extensionTypes[extension] || "";
}

function normalizeMediaFile(file: File) {
  const type = mediaFileType(file);
  return type && type !== file.type
    ? new File([file], file.name, { type, lastModified: file.lastModified })
    : file;
}

export async function compressImage(
  file: File,
  document: boolean,
): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const max = document ? 4096 : 2048;
    const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("这台设备暂时无法压缩图片，请重试。");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("图片压缩失败，请重试。"))),
        "image/webp",
        document ? 0.92 : 0.82,
      ),
    );
    return new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, "")}.${blob.type === "image/webp" ? "webp" : "png"}`,
      { type: blob.type },
    );
  } finally {
    bitmap.close();
  }
}
export async function prepareImage(file: File, document: boolean) {
  const normalized = normalizeMediaFile(file);
  // GIFs stay animated; HEIC/AVIF are decoded by the server.
  if (!/^image\/(jpeg|png|webp)$/.test(normalized.type)) return normalized;
  try {
    const header = new TextDecoder("ascii").decode(
      await normalized.slice(0, 6).arrayBuffer(),
    );
    if (header === "GIF87a" || header === "GIF89a")
      return new File([normalized], normalized.name, {
        type: "image/gif",
        lastModified: normalized.lastModified,
      });
    const policy = await api<{ preserveOriginals: boolean }>("/capabilities");
    return policy.preserveOriginals
      ? normalized
      : await compressImage(normalized, document);
  } catch {
    // Some browsers cannot decode images or use canvas. The server still
    // validates and optimizes the original upload.
    return normalized;
  }
}
export function uploadMedia(
  file: File,
  originalSize: number,
  imageKind: string,
  onProgress: (progress: number) => void,
  recordCreatedAt?: string,
): Promise<Media> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl("/media"));
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("网络连接中断，点击重试继续上传。"));
    xhr.timeout = 10 * 60 * 1000;
    xhr.ontimeout = () => reject(new Error("上传超时，请检查网络后重试。"));
    xhr.onload = () => {
      let data: {
        doc?: Media;
        errors?: {
          message?: string;
          data?: { errors?: { path?: string; message?: string }[] };
        }[];
      } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      const invalidContainer = data.errors?.[0]?.data?.errors?.some(
        (error) =>
          error.path === "file" &&
          error.message === "Invalid or corrupted ISO base media file.",
      );
      if (xhr.status >= 200 && xhr.status < 300 && data.doc) resolve(data.doc);
      else
        reject(
          new ApiError(
            (invalidContainer
              ? "文件不完整或格式有误，请重新导出后再上传。"
              : data.errors?.[0]?.message) ||
              (xhr.status === 413
                ? "文件超过上传上限，请选择更小的文件。"
                : "上传未成功，请点击重试。"),
            xhr.status,
          ),
        );
    };
    const body = new FormData();
    body.append(
      "_payload",
      JSON.stringify({
        alt: file.name,
        originalSize,
        imageKind,
        recordCreatedAt,
      }),
    );
    body.append("file", normalizeMediaFile(file));
    xhr.send(body);
  });
}
