import { SessionProvider } from "@/components/session";
import { Shell } from "@/components/shell";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
