import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
await mkdir(new URL("apps/cms/data/", root), { recursive: true });
await mkdir(new URL("apps/cms/media/", root), { recursive: true });
for (const app of ["cms", "web"]) {
  const dest = new URL(`apps/${app}/.env`, root);
  try {
    await access(dest);
    console.log(`${app}: 已保留现有 .env`);
    continue;
  } catch {}
  let text = await readFile(new URL(`apps/${app}/.env.example`, root), "utf8");
  if (app === "cms") {
    const secretPlaceholder = /^PAYLOAD_SECRET=[ \t]*(\r?\n|$)/m;
    if (!secretPlaceholder.test(text))
      throw new Error("后台环境模板缺少空的 PAYLOAD_SECRET，无法安全生成配置。");
    text = text.replace(
      secretPlaceholder,
      (_, ending) => `PAYLOAD_SECRET=${randomBytes(32).toString("hex")}${ending}`,
    );
  }
  await writeFile(dest, text, { mode: 0o600 });
  console.log(`${app}: 已创建 ${fileURLToPath(dest)}（已被 Git 忽略）`);
}
console.log(
  "请在 apps/cms/.env 中填写家长与孩子的邮箱和密码，再执行 npm run dev:prepare 和 npm run seed。",
);
