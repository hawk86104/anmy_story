import { PublicProjects } from "@/components/public-pages";
export const metadata = { title: "成长项目" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PublicProjects query={await searchParams} />;
}
