import type { Media } from "@mylife/shared";
import { api, ApiError } from "./api";
import { apiUrl } from "./urls";
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
  if (!file.type.startsWith("image/")) return file;
  const policy = await api<{ preserveOriginals: boolean }>("/capabilities");
  return policy.preserveOriginals ? file : compressImage(file, document);
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
      let data: { doc?: Media; errors?: { message: string }[] } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data.doc) resolve(data.doc);
      else
        reject(
          new ApiError(
            data.errors?.[0]?.message ||
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
    body.append("file", file);
    xhr.send(body);
  });
}
