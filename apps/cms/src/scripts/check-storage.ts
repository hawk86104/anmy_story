import "dotenv/config";
import { randomUUID, createHash } from "node:crypto";
import {
  datePrefix,
  putStored,
  readStored,
  removeStored,
  signedMediaURL,
} from "../lib/storage";

const key = `${datePrefix()}/checks/${randomUUID()}.txt`;
const bytes = Buffer.from("MyLife COS storage verification\n");
const result: Record<string, unknown> = {};
try {
  await putStored(key, bytes, "text/plain; charset=utf-8", "cos");
  result.uploadAndHead = true;
  result.downloadHashMatches =
    createHash("sha256")
      .update(await readStored(key, "cos"))
      .digest("hex") === createHash("sha256").update(bytes).digest("hex");
  const url = signedMediaURL(key);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  result.cdnStatus = response.status;
  result.cdnBytesMatch =
    response.ok && Buffer.from(await response.arrayBuffer()).equals(bytes);
  const range = await fetch(url, {
    headers: { Range: "bytes=0-5" },
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  result.cdnRangeStatus = range.status;
  result.cdnRangeMatches =
    range.status === 206 &&
    Buffer.from(await range.arrayBuffer()).equals(bytes.subarray(0, 6));
  const unsigned = new URL(url);
  unsigned.search = "";
  const denied = await fetch(unsigned, {
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  result.unsignedStatus = denied.status;
  result.unsignedDenied = !denied.ok;
  console.log(JSON.stringify(result));
  if (
    !result.cdnBytesMatch ||
    !result.cdnRangeMatches ||
    !result.unsignedDenied
  )
    process.exitCode = 1;
} finally {
  await removeStored(key, "cos");
  console.log("已删除云端验证文件。");
}
