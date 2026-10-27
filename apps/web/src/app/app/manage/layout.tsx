import { ManageShell } from "@/components/manage";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ManageShell>{children}</ManageShell>;
}
