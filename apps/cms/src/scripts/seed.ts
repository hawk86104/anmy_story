import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../payload.config";
import { closePayload } from "../lib/shutdown";
const parentEmail = process.env.PARENT_EMAIL?.trim();
const childEmail = process.env.CHILD_EMAIL?.trim();
const parentPassword = process.env.PARENT_PASSWORD || "";
const childPassword = process.env.CHILD_PASSWORD || "";
if (
  !parentEmail ||
  !childEmail ||
  parentEmail === childEmail ||
  parentPassword.length < 12 ||
  childPassword.length < 12 ||
  parentPassword === childPassword
)
  throw new Error(
    "请配置不同的 PARENT_EMAIL、CHILD_EMAIL，以及各自至少 12 位且不同的密码。",
  );
const payload = await getPayload({ config });
const existing = await payload.count({
  collection: "users",
  overrideAccess: true,
});
if (existing.totalDocs) {
  console.log("已有家庭账号，未修改任何账号。可用家长后台添加第二位家长。");
  await closePayload(payload);
  process.exit(0);
}
const familyId = randomUUID();
await payload.create({
  collection: "users",
  data: {
    email: parentEmail,
    password: parentPassword,
    name: process.env.PARENT_NAME || "家长",
    role: "parent",
    familyId,
  },
  overrideAccess: true,
  context: { bootstrap: true },
});
await payload.create({
  collection: "users",
  data: {
    email: childEmail,
    password: childPassword,
    name: process.env.CHILD_NAME || "小小记录家",
    role: "child",
    familyId,
    allowPublicPublishing: false,
  },
  overrideAccess: true,
  context: { bootstrap: true },
});
console.log(
  "已建立一个家庭、一个家长账号和一个孩子账号。请使用 .env 中设置的邮箱和密码登录。",
);
await closePayload(payload);
