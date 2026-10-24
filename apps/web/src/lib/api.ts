export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      data.errors?.[0]?.message ||
        data.error ||
        "暂时没有保存成功，请稍后重试。",
      response.status,
    );
  return data as T;
}
export function sizeLabel(size: number) {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}
import { apiUrl } from "./urls";
