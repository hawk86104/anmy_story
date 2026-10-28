import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import sharp from "sharp";
import { Users } from "./collections/Users";
import { Entries } from "./collections/Entries";
import { Media } from "./collections/Media";
import { Spaces } from "./collections/Spaces";
import { Projects } from "./collections/Projects";
import { EntryHistory } from "./collections/EntryHistory";
import { FamilyServices } from "./collections/FamilyServices";
import { member } from "./lib/access";
import { publicEntryEndpoints } from "./lib/public-entries";
import { familyEndpoints } from "./lib/family-endpoints";
import { aiEndpoints, familyService, serviceDTO } from "./lib/ai";
import { archiveEndpoints } from "./lib/archive";
import { withEntryConcurrency } from "./lib/entry-concurrency";
import { historyImportEndpoints } from "./lib/history-import";
import { cloudStoragePlugin } from "@payloadcms/plugin-cloud-storage";
import { mediaStorageAdapter } from "./lib/storage-adapter";
import { StorageCleanup } from "./collections/StorageCleanup";
import { backupManagementEndpoints } from "./lib/backup-management";
const dirname = path.dirname(fileURLToPath(import.meta.url));
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";
const cmsOrigin = process.env.CMS_ORIGIN || "http://localhost:3001";
if (!process.env.PAYLOAD_SECRET || process.env.PAYLOAD_SECRET.length < 32)
  throw new Error("请先运行 npm run setup，配置至少 32 位的 PAYLOAD_SECRET。");

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET,
  cookiePrefix: "mylife",
  serverURL: cmsOrigin,
  cors: [webOrigin, cmsOrigin],
  csrf: [webOrigin, cmsOrigin],
  admin: {
    user: Users.slug,
    meta: { titleSuffix: " · MyLife 家长后台" },
    importMap: { baseDir: dirname },
    components: { beforeDashboard: ["./components/DataManagement"] },
  },
  collections: [
    Users,
    Entries,
    Media,
    Spaces,
    Projects,
    EntryHistory,
    FamilyServices,
    StorageCleanup,
  ],
  plugins: [
    cloudStoragePlugin({
      alwaysInsertFields: true,
      collections: { media: { adapter: mediaStorageAdapter, prefix: "" } },
    }),
  ],
  sharp,
  db: withEntryConcurrency(
    sqliteAdapter({
      client: { url: process.env.DATABASE_URL || "file:./data/mylife.db" },
      transactionOptions: { behavior: "immediate" },
      wal: true,
      push:
        process.env.NODE_ENV !== "production" &&
        process.env.MYLIFE_MANAGED_SCHEMA !== "true" &&
        process.env.MYLIFE_MEDIA_WORKER !== "true",
    }),
  ),
  upload: {
    limits: {
      fileSize:
        Math.max(
          Math.min(2048, Number(process.env.MAX_BACKUP_MB) || 1024),
          Math.min(500, Number(process.env.MAX_UPLOAD_MB) || 100),
        ) *
        1024 *
        1024,
    },
    abortOnLimit: true,
  },
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  endpoints: [
    {
      path: "/health",
      method: "get",
      handler: async () => Response.json({ ok: true, app: "mylife-cms" }),
    },
    {
      path: "/capabilities",
      method: "get",
      handler: async (req) =>
        member(req)
          ? Response.json({
              aiEnabled: serviceDTO(await familyService(req)).enabled,
              preserveOriginals: serviceDTO(await familyService(req))
                .preserveOriginals,
              maxUploadMB: Math.min(
                500,
                Number(process.env.MAX_UPLOAD_MB) || 100,
              ),
              maxAttachments: 12,
            })
          : Response.json({ error: "请先登录。" }, { status: 401 }),
    },
    ...publicEntryEndpoints,
    ...familyEndpoints,
    ...aiEndpoints,
    ...archiveEndpoints,
    ...historyImportEndpoints,
    ...backupManagementEndpoints,
  ],
});
