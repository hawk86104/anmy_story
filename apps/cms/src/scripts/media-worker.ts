import "dotenv/config";
import { spawn } from "node:child_process";
import { readFile, mkdir, rm, stat, unlink, open } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import { mediaRoot } from "../collections/Media";
import { closePayload } from "../lib/shutdown";

const once = process.argv.includes("--once");
// Schema changes belong to the development preflight or production migrations.
Object.assign(process.env, { MYLIFE_MEDIA_WORKER: "true" });
const { default: config } = await import("../payload.config");
const timeout =
  Math.max(30, Number(process.env.VIDEO_TIMEOUT_SECONDS) || 600) * 1000;
function command(
  program: string,
  args: string[],
  maxTime: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (b) => {
      if (output.length < 100000) output += b.toString();
    });
    child.stderr.resume();
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("处理超时，请重试较短的视频。"));
    }, maxTime);
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("服务器未安装 FFmpeg / FFprobe，请联系家长配置。"));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output)
        : reject(
            new Error("视频转码失败，原视频仍保存在私人素材库，可稍后重试。"),
          );
    });
  });
}
// One consumer per SQLite deployment. An exclusive process lock prevents duplicate transcodes.
const lockPath = path.resolve(
  process.env.MEDIA_WORKER_LOCK || "./data/media-worker.lock",
);
await mkdir(path.dirname(lockPath), { recursive: true });
try {
  const oldPid = Number(await readFile(lockPath, "utf8"));
  try {
    process.kill(oldPid, 0);
    console.error("已有媒体处理进程。");
    process.exit(1);
  } catch {
    await unlink(lockPath);
  }
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const lock = await open(lockPath, "wx", 0o600);
await lock.writeFile(String(process.pid));
await lock.close();
let payload: Awaited<ReturnType<typeof getPayload>> | undefined;
let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
const workerContext = { mediaWorker: true };
try {
  payload = await getPayload({ config });
  // After a process restart, protected originals make interrupted jobs safe to retry.
  const interrupted = await payload.find({
    collection: "media",
    where: { processingStatus: { equals: "processing" } },
    limit: 100,
    depth: 0,
  });
  for (const doc of interrupted.docs)
    await payload.update({
      collection: "media",
      id: doc.id,
      data: { processingStatus: "queued" },
      context: workerContext,
    });
  console.log("MyLife 媒体处理已启动。");
  while (running) {
    const batch = await payload.find({
      collection: "media",
      where: { processingStatus: { equals: "queued" } },
      limit: 1,
      sort: "createdAt",
      depth: 0,
    });
    const doc = batch.docs[0];
    if (!doc) {
      if (once) break;
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    const tempDir = path.resolve("./.tmp", randomUUID());
    try {
      await payload.update({
        collection: "media",
        id: doc.id,
        data: { processingStatus: "processing", processingError: null },
        context: workerContext,
      });
      const input = path.resolve(mediaRoot, path.basename(doc.filename || ""));
      if (!doc.filename || !(await stat(input)).size)
        throw new Error("原视频暂时不可用，请重新上传。");
      const probe = JSON.parse(
        await command(
          process.env.FFPROBE_PATH || "ffprobe",
          [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            input,
          ],
          30000,
        ),
      );
      if (
        !probe.streams?.some(
          (s: { codec_type: string }) => s.codec_type === "video",
        )
      )
        throw new Error("文件中没有可播放的视频画面。");
      await mkdir(tempDir, { recursive: true });
      const output = path.join(tempDir, "optimized.mp4");
      await command(
        process.env.FFMPEG_PATH || "ffmpeg",
        [
          "-nostdin",
          "-y",
          "-i",
          input,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-vf",
          "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "26",
          "-pix_fmt",
          "yuv420p",
          "-threads",
          "2",
          "-c:a",
          "aac",
          "-b:a",
          "96k",
          "-movflags",
          "+faststart",
          "-map_metadata",
          "-1",
          output,
        ],
        timeout,
      );
      const verified = JSON.parse(
        await command(
          process.env.FFPROBE_PATH || "ffprobe",
          [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            output,
          ],
          30000,
        ),
      );
      if (
        !verified.streams?.some(
          (s: { codec_type: string }) => s.codec_type === "video",
        )
      )
        throw new Error("视频校验未通过，已保留原件。");
      const inputDuration = Number(probe.format?.duration),
        outputDuration = Number(verified.format?.duration);
      if (
        inputDuration > 0 &&
        (!outputDuration ||
          outputDuration < inputDuration - Math.max(0.5, inputDuration * 0.01))
      )
        throw new Error("视频时长校验未通过，已保留原件，请稍后重试。");
      const buffer = await readFile(output);
      await payload.update({
        collection: "media",
        id: doc.id,
        data: { processingStatus: "ready", processingError: null },
        file: {
          data: buffer,
          name: `${path.parse(doc.filename || "video").name}-optimized.mp4`,
          mimetype: "video/mp4",
          size: buffer.length,
        },
        context: workerContext,
      });
      // Only delete the protected original after the verified replacement was persisted.
      await unlink(input).catch(() => {});
      console.log(`素材 #${doc.id}：视频处理完成。`);
    } catch (error) {
      await payload.update({
        collection: "media",
        id: doc.id,
        data: {
          processingStatus: "failed",
          processingError:
            error instanceof Error
              ? error.message
              : "视频处理失败，可稍后重试。",
        },
        context: workerContext,
      });
      console.log(`素材 #${doc.id}：处理失败，原件已保留。`);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
    if (once) break;
  }
} finally {
  try {
    if (payload) await closePayload(payload);
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}
process.exit(0);
