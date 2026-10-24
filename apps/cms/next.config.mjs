import { withPayload } from "@payloadcms/next/withPayload";
export default withPayload({
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
});
