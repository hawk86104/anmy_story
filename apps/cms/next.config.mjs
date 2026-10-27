import { withPayload } from "@payloadcms/next/withPayload";
export default withPayload({
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
});
