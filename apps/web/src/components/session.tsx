"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  DEFAULT_PROFILE,
  type Member,
  type SpaceProfile,
} from "@mylife/shared";
import { api } from "@/lib/api";
const Session = createContext<{
  user: Member;
  logout: () => Promise<void>;
  profile: SpaceProfile & { canEdit?: boolean };
  refreshProfile: () => Promise<void>;
} | null>(null);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Member | null>(null);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<SpaceProfile & { canEdit?: boolean }>(
    DEFAULT_PROFILE,
  );
  const refreshProfile = useCallback(async () => {
    setProfile(await api<SpaceProfile & { canEdit: boolean }>("/family/space"));
  }, []);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (user) void refreshProfile().catch(() => {});
  }, [user?.id, refreshProfile]);
  useEffect(() => {
    let active = true;
    api<{ user: Member | null }>("/users/me")
      .then((r) => {
        if (!active) return;
        if (!r.user) {
          const entryPath = pathname.match(/^\/app\/entries\/([^/]+)$/);
          router.replace(
            entryPath
              ? `/entries/${entryPath[1]}`
              : `/login?next=${encodeURIComponent(pathname)}`,
          );
        } else setUser(r.user);
      })
      .catch(() => {
        if (active) setError("暂时无法连接成长空间，请检查网络后重试。");
      });
    return () => {
      active = false;
    };
  }, [router, pathname]);
  if (!user)
    return (
      <main className="loading-screen">
        <div className="loading-sprout">✳</div>
        <p>{error || "正在打开你的成长空间…"}</p>
        {error && (
          <button className="text-button" onClick={() => location.reload()}>
            重新连接
          </button>
        )}
      </main>
    );
  return (
    <Session.Provider
      value={{
        user,
        profile,
        refreshProfile,
        logout: async () => {
          await api("/users/logout", { method: "POST" });
          setUser(null);
          router.replace("/login");
          router.refresh();
        },
      }}
    >
      <div className="theme-scope" data-theme={profile.theme}>
        {children}
      </div>
    </Session.Provider>
  );
}
export function useSession() {
  const ctx = useContext(Session);
  if (!ctx) throw new Error("需要登录");
  return ctx;
}
