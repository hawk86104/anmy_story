import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaFileType, prepareImage, uploadMedia } from "../lib/media.ts";

test("根据常见扩展名补全缺失或不规范的浏览器类型", () => {
  for (const [name, type, expected] of [
    ["photo.JPG", "", "image/jpeg"],
    ["camera.heic", "application/octet-stream", "image/heic"],
    ["animated.gif", "image/jpeg", "image/gif"],
    ["movie.mp4", "application/octet-stream", "video/mp4"],
    ["clip.mkv", "video/x-matroska", "video/matroska"],
    ["voice.webm", "audio/webm", "audio/webm"],
    ["voice.wav", "audio/x-wav", "audio/wav"],
    ["document.pdf", "", "application/pdf"],
    ["unknown.exe", "application/octet-stream", ""],
  ])
    assert.equal(mediaFileType({ name, type }), expected);
});

test("浏览器无法压缩时保留图片，由服务端继续处理", async () => {
  const originalFetch = globalThis.fetch;
  const originalBitmap = globalThis.createImageBitmap;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ preserveOriginals: false }));
  globalThis.createImageBitmap = undefined;
  try {
    const file = new File(["original"], "photo.jpg", { type: "" });
    const prepared = await prepareImage(file, false);
    assert.equal(prepared.type, "image/jpeg");
    assert.equal(await prepared.text(), "original");
    const mislabeledGif = new File(["GIF89a..."], "animation.jpg", {
      type: "image/jpeg",
    });
    const animated = await prepareImage(mislabeledGif, false);
    assert.equal(animated.type, "image/gif");
    assert.equal(await animated.text(), "GIF89a...");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.createImageBitmap = originalBitmap;
  }
});

test("上传遇到损坏的媒体容器时显示可操作的提示，其他错误保持原样", async () => {
  const originalXHR = globalThis.XMLHttpRequest;
  let response;
  globalThis.XMLHttpRequest = class {
    upload = {};
    open() {}
    send() {
      this.status = 400;
      this.responseText = JSON.stringify(response);
      this.onload();
    }
  };
  const file = new File(["test"], "video.mp4", { type: "video/mp4" });
  try {
    response = {
      errors: [
        {
          message: "The following field is invalid: file",
          data: {
            errors: [
              {
                path: "file",
                message: "Invalid or corrupted ISO base media file.",
              },
            ],
          },
        },
      ],
    };
    await assert.rejects(
      uploadMedia(file, file.size, "photo", () => {}),
      {
        message: "文件不完整或格式有误，请重新导出后再上传。",
        status: 400,
      },
    );
    response = { errors: [{ message: "其他上传错误" }] };
    await assert.rejects(
      uploadMedia(file, file.size, "photo", () => {}),
      {
        message: "其他上传错误",
        status: 400,
      },
    );
  } finally {
    globalThis.XMLHttpRequest = originalXHR;
  }
});
