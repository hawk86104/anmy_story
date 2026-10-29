"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { SpaceProfile } from "@mylife/shared";

const PublicNavigation = createContext<{
  profile: SpaceProfile | null;
  rememberProfile: (profile: SpaceProfile) => void;
} | null>(null);

export function PublicNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<SpaceProfile | null>(null);
  const rememberProfile = useCallback(
    (next: SpaceProfile) => setProfile(next),
    [],
  );
  return (
    <PublicNavigation.Provider value={{ profile, rememberProfile }}>
      {children}
    </PublicNavigation.Provider>
  );
}

export function usePublicNavigation() {
  const context = useContext(PublicNavigation);
  if (!context) throw new Error("缺少公开页面导航状态");
  return context;
}
