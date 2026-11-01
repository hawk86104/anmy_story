import sharp from "sharp";
import { APIError } from "payload";

export async function convertHeic(data: Buffer, document: boolean) {
  try {
    const { default: decode } = await import("heic-decode");
    const images = await decode.all({ buffer: data });
    try {
      if (images.length !== 1)
        throw new APIError("这份 HEIC 含有多张图片，请拆分后再上传。", 400);
      const image = images[0];
      if (
        !image.width ||
        !image.height ||
        image.width * image.height > 80_000_000
      )
        throw new APIError("图片尺寸过大，请缩小后再上传。", 400);
      const decoded = await image.decode();
      return await sharp(Buffer.from(decoded.data), {
        raw: { width: decoded.width, height: decoded.height, channels: 4 },
        limitInputPixels: 80_000_000,
      })
        .resize(document ? 4096 : 2048, document ? 4096 : 2048, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: document ? 92 : 82 })
        .toBuffer();
    } finally {
      images.dispose();
    }
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError("HEIC 图片无法处理，请重新导出后上传。", 400);
  }
}
