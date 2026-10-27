import "server-only";
import { DEFAULT_PROFILE, type SpaceProfile } from "@mylife/shared";

export async function publicApi<T>(path: string): Promise<T> {
  const origin =
    process.env.CMS_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_ORIGIN ||
    "http://127.0.0.1:3001";
  const response = await fetch(
    `${origin.replace(/\/$/, "")}/api/public${path}`,
    { cache: "no-store", signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "not-found"
        : "成长空间暂时无法连接，请稍后重试。",
    );
  return response.json();
}
export const publicProfile = () =>
  publicApi<SpaceProfile>("/profile").catch(() => DEFAULT_PROFILE);
export interface PageData<T> {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
}
export const emptyPage = <T>(): PageData<T> => ({
  docs: [],
  totalDocs: 0,
  page: 1,
  totalPages: 1,
  hasNextPage: false,
});
