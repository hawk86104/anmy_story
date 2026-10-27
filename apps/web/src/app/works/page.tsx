import { PublicCollection } from "@/components/public-pages";
export const metadata = { title: "作品展厅" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PublicCollection mode="works" query={await searchParams} />;
}
