const cms = process.env.CMS_INTERNAL_URL || "http://127.0.0.1:3001";
const directApi = Boolean(process.env.NEXT_PUBLIC_API_ORIGIN?.trim());
export default {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  transpilePackages: ["@mylife/shared"],
  experimental: { proxyClientMaxBodySize: "1100mb" },
  ...(!directApi
    ? {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${cms}/api/:path*` }];
        },
      }
    : {}),
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
      {
        source: "/offline.html",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
          },
        ],
      },
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
