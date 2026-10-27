import { PublicProjectDetail } from "@/components/public-pages";
export const metadata = { title: "我的成长项目" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicProjectDetail id={id} />;
}
