import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { getPayload, handleEndpoints } from "payload";
import { closePayload } from "../lib/shutdown";

test(
  "真实上传接口兼容常见素材、浏览器类型差异与 PDF 容器边界",
  { timeout: 90000 },
  async (t) => {
    const temp = await mkdtemp(path.join(tmpdir(), "mylife-upload-test-"));
    Object.assign(process.env, {
      MEDIA_STORAGE: "local",
      PAYLOAD_SECRET: randomBytes(32).toString("hex"),
      DATABASE_URL: `file:${path.join(temp, "test.db")}`,
      MEDIA_ROOT: path.join(temp, "media"),
      ORIGINALS_ROOT: path.join(temp, "originals"),
      MEDIA_WORKER_LOCK: path.join(temp, "worker.lock"),
    });
    const { default: config } = await import("../payload.config");
    const { readMedia, originalLocation, localMediaPath, mediaKey } =
      await import("../lib/storage");
    const payload = await getPayload({ config });
    try {
      const password = randomBytes(20).toString("hex"),
        familyId = randomUUID();
      const user = await payload.create({
        collection: "users",
        data: {
          name: "家长",
          email: "upload@example.invalid",
          password,
          role: "parent",
          familyId,
        },
        overrideAccess: true,
        context: { bootstrap: true },
      });
      await payload.create({
        collection: "family-services",
        data: { familyId, preserveOriginals: true },
        user,
        overrideAccess: false,
      });
      const { token } = await payload.login({
        collection: "users",
        data: { email: user.email, password },
      });
      assert.ok(token);
      async function upload(data: Buffer, name: string, mime: string) {
        const body = new FormData();
        body.append(
          "_payload",
          JSON.stringify({
            alt: name,
            originalSize: data.length,
            imageKind: "photo",
          }),
        );
        body.append(
          "file",
          new Blob([new Uint8Array(data)], { type: mime }),
          name,
        );
        const response = await handleEndpoints({
          config,
          request: new Request("http://localhost:3001/api/media", {
            method: "POST",
            headers: { Authorization: `JWT ${token}` },
            body,
          }),
        });
        const result = await response.json();
        return { response, result };
      }
      async function uploaded(data: Buffer, name: string, mime: string) {
        const { response, result } = await upload(data, name, mime);
        assert.equal(response.status, 201, JSON.stringify(result));
        return payload.findByID({
          collection: "media",
          id: result.doc.id,
          overrideAccess: true,
        });
      }

      await t.test(
        "JPEG、PNG、WebP、AVIF 和 HEIC 使用真实内容识别并保留原件",
        async () => {
          const img = () =>
            sharp({
              create: {
                width: 32,
                height: 24,
                channels: 3,
                background: "#d79271",
              },
            });
          const heic = await readFile(
            new URL("./fixtures/camera-sample.heic", import.meta.url),
          );
          const samples = [
            {
              name: "photo.jpg",
              mime: "",
              data: await img().jpeg().toBuffer(),
            },
            {
              name: "photo.png",
              mime: "application/octet-stream",
              data: await img().png().toBuffer(),
            },
            {
              name: "photo.webp",
              mime: "image/jpeg",
              data: await img().webp().toBuffer(),
            },
            {
              name: "photo.avif",
              mime: "image/avif",
              data: await img().avif().toBuffer(),
            },
            {
              name: "photo.heic",
              mime: "application/octet-stream",
              data: heic,
            },
          ];
          for (const sample of samples) {
            const doc = await uploaded(sample.data, sample.name, sample.mime);
            assert.equal(doc.mimeType, "image/webp", sample.name);
            assert.equal(doc.processingStatus, "ready");
            assert.equal(
              (await sharp(await readMedia(doc)).metadata()).format,
              "webp",
            );
            assert.deepEqual(
              await readFile(originalLocation(doc).local),
              sample.data,
            );
          }
        },
      );

      await t.test("GIF 动画保留所有帧", async () => {
        const frame = Buffer.alloc(8 * 8 * 4, 255);
        const second = Buffer.alloc(8 * 8 * 4, 20);
        const gif = await sharp(Buffer.concat([frame, second]), {
          raw: { width: 8, height: 16, channels: 4, pageHeight: 8 },
        })
          .gif({ delay: [150, 180], loop: 0 })
          .toBuffer();
        const doc = await uploaded(gif, "animated.gif", "image/gif");
        assert.equal(doc.mimeType, "image/gif");
        assert.deepEqual(await readFile(originalLocation(doc).local), gif);
        const metadata = await sharp(await readMedia(doc), {
          animated: true,
        }).metadata();
        assert.equal(metadata.pages, 2);
        assert.deepEqual(metadata.delay, [150, 180]);
      });

      await t.test(
        "普通 PDF 以及头部有前缀或尾部有额外字节的 PDF 原样保存",
        async () => {
          const pdf = await PDFDocument.create();
          pdf.addPage([200, 200]);
          const normal = Buffer.from(await pdf.save());
          for (const data of [
            normal,
            Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), normal]),
            Buffer.concat([normal, Buffer.alloc(2048, 32)]),
          ]) {
            const doc = await uploaded(
              data,
              "document.pdf",
              "application/octet-stream",
            );
            assert.equal(doc.mimeType, "application/pdf");
            assert.deepEqual(await readMedia(doc), data);
          }
        },
      );

      await t.test("多种视频容器和没有类型信息的音频都能完成处理", async () => {
        const run = promisify(execFile);
        const audioPath = path.join(temp, "audio.webm");
        await run(process.env.FFMPEG_PATH || "ffmpeg", [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440",
          "-t",
          "0.3",
          audioPath,
        ]);
        const queued = [];
        const samples: [string, string, string, number[]][] = [
          ["mp4", "libx264", "red", [255, 0, 0]],
          ["mov", "libx264", "lime", [0, 255, 0]],
          ["webm", "libvpx-vp9", "blue", [0, 0, 255]],
          ["mkv", "libx264", "yellow", [255, 255, 0]],
          ["avi", "mpeg4", "magenta", [255, 0, 255]],
          ["3gp", "mpeg4", "cyan", [0, 255, 255]],
        ];
        for (const [extension, codec, color, expected] of samples) {
          const input = path.join(temp, `clip.${extension}`);
          await run(process.env.FFMPEG_PATH || "ffmpeg", [
            "-y",
            "-f",
            "lavfi",
            "-i",
            `color=c=${color}:size=128x96:rate=10`,
            "-t",
            "0.3",
            "-c:v",
            codec,
            "-threads",
            "1",
            input,
          ]);
          const reported =
            extension === "mp4"
              ? "audio/mp4"
              : extension === "webm"
                ? "audio/webm"
                : "application/octet-stream";
          const video = await uploaded(
            await readFile(input),
            `clip.${extension}`,
            reported,
          );
          assert.equal(video.processingStatus, "queued", extension);
          queued.push({ id: video.id, mime: "video/mp4", expected });
        }
        const audio = await uploaded(
          await readFile(audioPath),
          "voice.webm",
          "audio/webm",
        );
        assert.equal(audio.mimeType, "audio/webm");
        assert.equal(audio.processingStatus, "ready");
        const unknownAudio = await uploaded(
          await readFile(audioPath),
          "unknown.webm",
          "video/webm",
        );
        assert.equal(unknownAudio.processingStatus, "queued");
        assert.deepEqual(
          await readMedia(unknownAudio),
          await readFile(audioPath),
        );
        queued.push({
          id: unknownAudio.id,
          mime: "audio/mp4",
          expected: undefined,
        });
        const worker = await run(
          process.execPath,
          ["--import", "tsx", "src/scripts/media-worker.ts", "--drain"],
          {
            cwd: process.cwd(),
            env: process.env,
            timeout: 60000,
          },
        );
        for (const item of queued) {
          const processed = await payload.findByID({
            collection: "media",
            id: item.id,
          });
          assert.equal(
            processed.processingStatus,
            "ready",
            processed.processingError || "处理失败",
          );
          assert.equal(
            processed.mimeType,
            item.mime,
            `素材 #${item.id}: ${worker.stdout}`,
          );
          if (item.expected) {
            const pixel = (
              await run(
                process.env.FFMPEG_PATH || "ffmpeg",
                [
                  "-v",
                  "error",
                  "-i",
                  localMediaPath(mediaKey(processed)),
                  "-frames:v",
                  "1",
                  "-vf",
                  "scale=1:1",
                  "-pix_fmt",
                  "rgb24",
                  "-f",
                  "rawvideo",
                  "pipe:1",
                ],
                { encoding: "buffer" },
              )
            ).stdout;
            for (let channel = 0; channel < 3; channel++)
              assert.ok(
                Math.abs(pixel[channel] - item.expected[channel]) < 35,
                `素材 #${item.id} 的画面与原视频不符`,
              );
          }
        }
      });

      await t.test("伪造或损坏文件仍被拒绝", async () => {
        for (const data of [
          Buffer.from("<html>not a PDF</html>"),
          Buffer.from("%PDF-1.7\ninvalid\n%%EOF"),
        ]) {
          const { response } = await upload(
            data,
            "fake.pdf",
            "application/pdf",
          );
          assert.equal(response.status, 400);
        }
      });
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
