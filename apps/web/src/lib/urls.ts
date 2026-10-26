const configuredOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.trim() || "";
export const apiOrigin = configuredOrigin
  ? new URL(configuredOrigin).origin
  : "";

// An empty origin uses the local Next.js proxy. Pages deployments call the CMS directly.
export function apiUrl(path: string) {
  return `${apiOrigin}/api${path.startsWith("/") ? path : `/${path}`}`;
}

export function mediaUrl(url?: string | null) {
  if (!url) return "";
  const parsed = new URL(url, "http://localhost");
  if (!["http:", "https:"].includes(parsed.protocol)) return "";
  if (parsed.pathname.startsWith("/api/")) {
    return `${apiOrigin}${parsed.pathname}${parsed.search}`;
  }
  return url;
}
