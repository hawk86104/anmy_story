"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ThemeId } from "@mylife/shared";
import { getThemeAssets } from "./theme-assets";

const ThemeContext = createContext<ThemeId>("usagi");

export function ThemeProvider({ theme, children }: { theme: ThemeId; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function ThemeMascot({
  className = "",
  size = 180,
  theme,
  mood = "journal",
}: {
  className?: string;
  size?: number;
  theme?: ThemeId;
  mood?: "journal" | "thinking" | "celebrate";
}) {
  const currentTheme = useContext(ThemeContext);
  const assets = getThemeAssets(theme ?? currentTheme);
  return (
    <img
      className={`theme-sticker ${className}`}
      src={mood === "journal" ? assets.sticker : assets.stickerVariants?.[mood] || assets.sticker}
      width={size}
      height={size}
      alt={assets.stickerAlt}
      loading="lazy"
      onError={(event) => {
        const image = event.currentTarget;
        if (image.getAttribute("src") === "/app-icon.svg") return;
        image.src = "/app-icon.svg";
        image.alt = "成长手记";
      }}
    />
  );
}

export function ThemeBrandMark({ neutral = false }: { neutral?: boolean }) {
  const theme = useContext(ThemeContext);
  return (
    <img
      className="brand-mark"
      src={neutral ? "/app-icon.svg" : getThemeAssets(theme).mark}
      width={44}
      height={44}
      alt=""
    />
  );
}

export function ThemeHero({
  theme,
  coverUrl,
  coverAlt,
}: {
  theme: ThemeId;
  coverUrl?: string;
  coverAlt?: string | null;
}) {
  const assets = getThemeAssets(theme);
  return (
    <picture className="site-hero-picture">
      {!coverUrl && assets.mobileBanner && (
        <source media="(max-width: 720px)" srcSet={assets.mobileBanner} />
      )}
      <img
        src={coverUrl || assets.banner}
        crossOrigin={coverUrl ? "use-credentials" : undefined}
        alt={coverAlt || (coverUrl ? "公开主页封面" : assets.bannerAlt)}
        fetchPriority="high"
        onError={(event) => {
          const image = event.currentTarget;
          if (image.getAttribute("src") === "/app-icon.svg") return;
          image.parentElement?.querySelectorAll("source").forEach((source) => {
            source.srcset = "/app-icon.svg";
          });
          image.src = "/app-icon.svg";
          image.alt = "成长手记";
        }}
      />
    </picture>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="theme-empty">
      <ThemeMascot size={150} mood="thinking" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
