import { test } from "node:test";
import assert from "node:assert/strict";
import { repairTrailingMediaData } from "../lib/video-upload";

function box(type: string, data = Buffer.alloc(0), extended = false) {
  const header = Buffer.alloc(extended ? 16 : 8);
  header.writeUInt32BE(extended ? 1 : header.length + data.length);
  header.write(type, 4, 4, "latin1");
  if (extended) header.writeBigUInt64BE(BigInt(header.length + data.length), 8);
  return Buffer.concat([header, data]);
}

const ftyp = box("ftyp", Buffer.from("isom\0\0\0\0isom", "latin1"));
const moov = box("moov");
const mdat = box("mdat", Buffer.alloc(200, 0xff));

test("正常容器、其他损坏结构和过长的尾部不会被改写", () => {
  const valid = Buffer.concat([ftyp, moov, mdat, box("free")]);
  assert.strictEqual(repairTrailingMediaData(valid), valid);

  const truncatedMovie = Buffer.concat([
    ftyp,
    Buffer.from([0, 0, 1, 0, 109, 111, 111, 118]),
  ]);
  assert.strictEqual(repairTrailingMediaData(truncatedMovie), truncatedMovie);

  const missingMovie = Buffer.concat([ftyp, mdat]);
  missingMovie.writeUInt32BE(mdat.length - 169, ftyp.length);
  assert.strictEqual(repairTrailingMediaData(missingMovie), missingMovie);

  const longTail = Buffer.concat([
    ftyp,
    moov,
    mdat,
    Buffer.alloc(1024 * 1024 + 1, 0xff),
  ]);
  assert.strictEqual(repairTrailingMediaData(longTail), longTail);
});

test("支持扩展长度的末尾 mdat，同时保留所有原始数据", () => {
  const extended = box("mdat", Buffer.alloc(200, 0xff), true);
  const valid = Buffer.concat([ftyp, moov, extended]);
  const malformed = Buffer.from(valid);
  malformed.writeBigUInt64BE(
    BigInt(extended.length - 169),
    ftyp.length + moov.length + 8,
  );
  const original = Buffer.from(malformed);
  assert.deepEqual(repairTrailingMediaData(malformed), valid);
  assert.deepEqual(malformed, original);
});
