import config from "@payload-config";
import {
  REST_GET,
  REST_POST,
  REST_DELETE,
  REST_PATCH,
  REST_PUT,
  REST_OPTIONS,
} from "@payloadcms/next/routes";
function protect<T extends (...args: never[]) => Promise<Response>>(
  handler: T,
): T {
  return (async (...args: Parameters<T>) => {
    const response = await handler(...args);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.append("Vary", "Origin");
    return response;
  }) as T;
}
export const GET = protect(REST_GET(config));
export const POST = protect(REST_POST(config));
export const DELETE = protect(REST_DELETE(config));
export const PATCH = protect(REST_PATCH(config));
export const PUT = protect(REST_PUT(config));
export const OPTIONS = protect(REST_OPTIONS(config));
