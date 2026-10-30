"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  DEFAULT_PROFILE,
  type Member,
  type SpaceProfile,
} from "@mylife/shared";
import { api } from "@/lib/api";
import { ThemeProvider } from "./theme";
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
  const [profileReady, setProfileReady] = useState(false);
  const refreshProfile = useCallback(async () => {
    setProfile(await api<SpaceProfile & { canEdit: boolean }>("/family/space"));
  }, []);
  const router = useRouter();
  const pathname = usePathname();
  const pendingAuth = useRef<Promise<{ user: Member | null }> | null>(null);
  const authVersion = useRef(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void refreshProfile().catch(() => {}).finally(() => {
      if (active) setProfileReady(true);
    });
    return () => { active = false; };
  }, [user?.id, refreshProfile]);
  useEffect(() => {
    let active = true;
    const version = authVersion.current;
    if (!pendingAuth.current) {
      const request = api<{ user: Member | null }>("/users/me");
      pendingAuth.current = request;
      void request.then(
        () => {
          if (pendingAuth.current === request) pendingAuth.current = null;
        },
        () => {
          if (pendingAuth.current === request) pendingAuth.current = null;
        },
      );
    }
    pendingAuth.current
      .then((r) => {
        if (!active || version !== authVersion.current) return;
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
        if (active && version === authVersion.current)
          setError("暂时无法连接成长空间，请检查网络后重试。");
      });
    return () => {
      active = false;
    };
  }, [router, pathname]);
  if (!user || !profileReady)
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
          authVersion.current += 1;
          pendingAuth.current = null;
          setUser(null);
          setProfileReady(false);
          router.replace("/login");
          router.refresh();
        },
      }}
    >
      <ThemeProvider theme={profile.theme}>
        <div className="theme-scope" data-theme={profile.theme}>
          {children}
        </div>
      </ThemeProvider>
    </Session.Provider>
  );
}
export function useSession() {
  const ctx = useContext(Session);
  if (!ctx) throw new Error("需要登录");
  return ctx;
}
