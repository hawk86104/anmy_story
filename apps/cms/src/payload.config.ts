import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import sharp from "sharp";
import { Users } from "./collections/Users";
import { Entries } from "./collections/Entries";
import { Media } from "./collections/Media";
import { member } from "./lib/access";
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
  },
  collections: [Users, Entries, Media],
  sharp,
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || "file:./data/mylife.db" },
    push: process.env.NODE_ENV !== "production",
  }),
  upload: {
    limits: {
      fileSize:
        Math.min(500, Number(process.env.MAX_UPLOAD_MB) || 100) * 1024 * 1024,
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
              aiEnabled: false,
              maxUploadMB: Math.min(
                500,
                Number(process.env.MAX_UPLOAD_MB) || 100,
              ),
              maxAttachments: 12,
            })
          : Response.json({ error: "请先登录。" }, { status: 401 }),
    },
    {
      path: "/public/entries",
      method: "get",
      handler: async (req) => {
        const entries = await req.payload.find({
          collection: "entries",
          where: { publicSnapshot: { exists: true } },
          sort: "-occurredAt",
          depth: 0,
          limit: 100,
          overrideAccess: true,
          req,
        });
        return Response.json(
          {
            docs: entries.docs
              .filter((d) => d.publicSnapshot)
              .map((d) => ({ ...(d.publicSnapshot as object), id: d.id })),
            totalDocs: entries.docs.filter((d) => d.publicSnapshot).length,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  ],
});
