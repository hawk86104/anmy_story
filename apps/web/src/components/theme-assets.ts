import { isThemeId, type ThemeId } from "@mylife/shared";

type ThemeAssets = {
  banner: string;
  mobileBanner?: string;
  sticker: string;
  stickerVariants?: Partial<Record<"thinking" | "celebrate", string>>;
  mark: string;
  preview?: string;
  bannerAlt: string;
  stickerAlt: string;
  heroTag: string;
};

const originalAssets: ThemeAssets = {
  banner: "/themes/usagi/meadow.webp",
  sticker: "/themes/usagi/sticker.webp",
  mark: "/themes/usagi/mark.webp",
  bannerAlt: "乌萨奇和朋友们的阳光草地",
  stickerAlt: "抱着手账的乌萨奇",
  heroTag: "和乌萨奇一起，收藏小日子",
};

export const THEME_ASSETS: Record<ThemeId, ThemeAssets> = {
  usagi: { ...originalAssets, preview: originalAssets.banner },
  hachiware: originalAssets,
  chiikawa: originalAssets,
  dashu: {
    banner: "/themes/dashu/hero-desktop.webp",
    mobileBanner: "/themes/dashu/hero-mobile.webp",
    sticker: "/themes/dashu/sticker-journal.webp",
    stickerVariants: {
      thinking: "/themes/dashu/sticker-thinking.webp",
      celebrate: "/themes/dashu/sticker-celebrate.webp",
    },
    mark: "/app-icon.svg",
    preview: "/themes/dashu/hero-desktop.webp",
    bannerAlt: "小灰鼠和成长手账的纸张拼贴插画",
    stickerAlt: "原创小灰鼠手账插画",
    heroTag: "和小灰鼠一起，收藏小日子",
  },
};

export function getThemeAssets(theme: unknown): ThemeAssets {
  return THEME_ASSETS[isThemeId(theme) ? theme : "usagi"];
}
