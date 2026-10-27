import { createHmac, timingSafeEqual } from "node:crypto";
import { APIError } from "payload";
export function originalProof(
  content: string,
  user: number,
  family: string,
  clientId: string,
) {
  const value = Buffer.from(
    JSON.stringify({ content, user, family, clientId }),
  ).toString("base64url");
  return `${value}.${createHmac("sha256", process.env.PAYLOAD_SECRET || "")
    .update(value)
    .digest("base64url")}`;
}
export function verifiedOriginal(
  token: string,
  user: number,
  family: string,
  clientId: string,
): string {
  try {
    if (token.length > 300000) throw Error();
    const [value, signature, ...extra] = token.split(".");
    if (extra.length || !value || !signature) throw Error();
    const expected = createHmac("sha256", process.env.PAYLOAD_SECRET || "")
        .update(value)
        .digest(),
      actual = Buffer.from(signature, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw Error();
    const data = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      data.user !== user ||
      data.family !== family ||
      data.clientId !== clientId ||
      typeof data.content !== "string" ||
      data.content.length > 50000
    )
      throw Error();
    return data.content;
  } catch {
    throw new APIError(
      "AI 整理原文校验未通过，草稿仍保留，请重新打开后再保存。",
      400,
    );
  }
}
