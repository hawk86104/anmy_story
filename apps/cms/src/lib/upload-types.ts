import path from "node:path";
import { spawn } from "node:child_process";
import { fileTypeFromBuffer } from "file-type";
import { APIError } from "payload";

const supported = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/matroska",
  "video/vnd.avi",
  "video/3gpp",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "application/pdf",
]);

async function probeMediaKind(
  data: Buffer,
): Promise<"video" | "audio" | undefined> {
  return new Promise((resolve) => {
    const child = spawn(
      process.env.FFPROBE_PATH || "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type:stream_disposition=attached_pic",
        "-of",
        "json",
        "-i",
        "pipe:0",
      ],
      { stdio: ["pipe", "pipe", "ignore"], windowsHide: true },
    );
    let output = "",
      done = false;
    const finish = (kind?: "video" | "audio") => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(kind);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish();
    }, 15000);
    child.on("error", () => finish());
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk: Buffer) => {
      if (output.length < 100_000) output += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) return finish();
      try {
        const streams = JSON.parse(output).streams as {
          codec_type?: string;
          disposition?: { attached_pic?: number };
        }[];
        if (
          streams.some(
            (s) => s.codec_type === "video" && !s.disposition?.attached_pic,
          )
        )
          return finish("video");
        if (streams.some((s) => s.codec_type === "audio"))
          return finish("audio");
      } catch {}
      finish();
    });
    child.stdin.end(data);
  });
}

export async function identifyUpload(
  data: Buffer,
  name: string,
  declared: string,
) {
  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(data);
  } catch {
    throw new APIError("文件无法识别，请重新选择或导出后再试。", 400);
  }
  const reported = declared.split(";", 1)[0].trim().toLowerCase();
  const extension = path.extname(name).toLowerCase();
  const pdfHeader = data.subarray(0, 1024).indexOf("%PDF-");
  let mime = detected?.mime || "";

  // A valid PDF header can occur after a short prefix; the PDF parser below
  // checks the document before any exception to Payload's strict validator.
  if (
    !mime &&
    pdfHeader >= 0 &&
    (extension === ".pdf" || reported.includes("pdf"))
  )
    mime = "application/pdf";
  // The WebM and ISO MP4 signatures alone cannot identify their tracks.
  const isWebm = mime === "video/webm";
  const isMp4 = [
    "video/mp4",
    "audio/mp4",
    "audio/x-m4a",
    "video/quicktime",
  ].includes(mime);
  if (
    (isWebm || isMp4) &&
    (reported.startsWith("audio/") || extension === ".m4a")
  ) {
    const kind = await probeMediaKind(data);
    if (kind === "audio") mime = isWebm ? "audio/webm" : "audio/mp4";
    else if (kind === "video")
      mime = isWebm
        ? "video/webm"
        : mime === "video/quicktime"
          ? mime
          : "video/mp4";
    else if (isWebm && reported === "audio/webm") mime = "audio/webm";
    else if (isMp4 && (reported.startsWith("audio/") || extension === ".m4a"))
      mime = "audio/mp4";
  }
  if (mime === "audio/x-m4a") mime = "audio/mp4";
  if (!supported.has(mime))
    throw new APIError(
      "文件格式无法识别或暂不支持，请选择常见图片、视频、音频或 PDF。",
      400,
    );

  const ext =
    mime === "audio/webm"
      ? ".webm"
      : mime === "audio/mp4" || mime === "audio/x-m4a"
        ? ".m4a"
        : mime === "application/pdf"
          ? ".pdf"
          : `.${detected?.ext || extension.slice(1)}`;
  return { mime, extension: ext };
}

export async function needsPDFCompatibilityValidation(data: Buffer) {
  const tail = data
    .subarray(Math.max(0, data.length - 1024))
    .toString("latin1");
  if (
    data.subarray(0, 5).toString("latin1") === "%PDF-" &&
    tail.includes("%%EOF") &&
    tail.includes("xref")
  )
    return false;
  const header = data.subarray(0, 1024).indexOf("%PDF-");
  const eof = data.lastIndexOf("%%EOF");
  if (header < 0 || eof < header || data.length - eof > 1024 * 1024)
    throw new APIError("PDF 文件不完整或格式有误，请重新导出后再上传。", 400);
  try {
    const { PDFDocument } = await import("pdf-lib");
    const document = await PDFDocument.load(data, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
    document.getPageCount();
    return true;
  } catch {
    throw new APIError("PDF 文件无法读取，请重新导出后再上传。", 400);
  }
}
