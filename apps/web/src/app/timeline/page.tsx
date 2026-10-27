import { PublicCollection } from "@/components/public-pages";
export const metadata = { title: "成长时间轴" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PublicCollection mode="timeline" query={await searchParams} />;
}
