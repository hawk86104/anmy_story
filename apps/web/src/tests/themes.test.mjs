import { test } from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { THEMES, isThemeId } from "@mylife/shared";
import { getThemeAssets } from "../components/theme-assets.ts";
import { EmptyState, ThemeBrandMark, ThemeHero, ThemeMascot, ThemeProvider } from "../components/theme.tsx";

test("四套主题有可用资产，新主题不会回退到旧角色", async () => {
  assert.deepEqual(THEMES.map((theme) => theme.value), ["usagi", "hachiware", "chiikawa", "dashu"]);
  assert.equal(isThemeId("dashu"), true);
  assert.equal(isThemeId("invalid"), false);
  assert.equal(getThemeAssets("invalid"), getThemeAssets("usagi"));
  const assets = getThemeAssets("dashu");
  for (const asset of [assets.banner, assets.mobileBanner, assets.sticker, assets.stickerVariants?.thinking, assets.stickerVariants?.celebrate, assets.mark]) {
    assert.ok(asset && !asset.includes("usagi"));
    await access(path.join(process.cwd(), "public", asset.slice(1)));
  }
  const markup = renderToStaticMarkup(React.createElement(ThemeProvider, { theme: "dashu" },
    React.createElement(React.Fragment, null,
      React.createElement(ThemeBrandMark), React.createElement(ThemeMascot),
      React.createElement(EmptyState, { title: "空状态", description: "说明" }))));
  assert.match(markup, /themes\/dashu\/sticker-journal\.webp/);
  assert.match(markup, /themes\/dashu\/sticker-thinking\.webp/);
  assert.match(markup, /app-icon\.svg/);
  assert.doesNotMatch(markup, /usagi|乌萨奇/i);
  const legacy = renderToStaticMarkup(React.createElement(ThemeProvider, { theme: "hachiware" }, React.createElement(ThemeMascot)));
  assert.match(legacy, /themes\/usagi\/sticker\.webp/);
});

test("主题横幅为手机提供独立图片，用户封面始终优先", () => {
  const renderHero = (props) => renderToStaticMarkup(React.createElement(ThemeHero, { theme: "dashu", ...props }));
  const preset = renderHero({});
  assert.match(preset, /themes\/dashu\/hero-desktop\.webp/);
  assert.match(preset, /themes\/dashu\/hero-mobile\.webp/);
  const custom = renderHero({ coverUrl: "https://media.example.com/cover.jpg", coverAlt: "我的照片" });
  assert.match(custom, /media\.example\.com\/cover\.jpg/);
  assert.match(custom, /我的照片/);
  assert.doesNotMatch(custom, /themes\/dashu\/hero-(desktop|mobile)/);
});
