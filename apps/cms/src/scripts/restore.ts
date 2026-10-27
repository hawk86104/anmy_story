import "dotenv/config";
import { getPayload } from "payload";
import { closePayload } from "../lib/shutdown";
import { restoreFamilyArchive } from "../lib/restore";
const args = process.argv.slice(2),
  value = (key: string) => args[args.indexOf(key) + 1];
if (
  args.includes("--help") ||
  !args.includes("--source") ||
  !args.includes("--family-id")
) {
  console.log(
    "用法：npm run restore -- --source <已解压的档案目录> --family-id <目标家庭ID> [--apply] [--allow-missing]\n默认只检查，不写入。目标家庭必须已有家长账号。--apply 才写入，恢复的记录与项目保持家庭可见。缺失素材默认阻止导入。",
  );
  process.exit(args.includes("--help") ? 0 : 1);
}
// A dry run must never trigger the development adapter's automatic schema push.
Object.assign(process.env, { NODE_ENV: "production" });
const { default: config } = await import("../payload.config");
const payload = await getPayload({ config });
try {
  const report = await restoreFamilyArchive(payload, {
    source: value("--source"),
    familyId: value("--family-id"),
    apply: args.includes("--apply"),
    allowMissing: args.includes("--allow-missing"),
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await closePayload(payload);
}
