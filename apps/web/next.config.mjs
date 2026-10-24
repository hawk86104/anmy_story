const cms = process.env.CMS_INTERNAL_URL || "http://127.0.0.1:3001";
export default {
  poweredByHeader: false,
  transpilePackages: ["@mylife/shared"],
  experimental: { proxyClientMaxBodySize: "110mb" },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${cms}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};
