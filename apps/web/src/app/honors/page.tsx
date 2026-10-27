import { PublicCollection } from "@/components/public-pages";
export const metadata = { title: "小里程碑" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PublicCollection mode="honors" query={await searchParams} />;
}
