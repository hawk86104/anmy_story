"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Flower2, Globe2, Palette } from "lucide-react";
import { THEMES, type SpaceProfile } from "@mylife/shared";
import { api } from "@/lib/api";
import { mediaUrl } from "@/lib/urls";
import { useSession } from "./session";
import { MediaPicker } from "./media-picker";
import { themeAssets } from "./theme";

export function ProfileSettings() {
  const { profile, refreshProfile } = useSession();
  const [form, setForm] = useState(profile),
    [interests, setInterests] = useState(
      profile.interests.map((i) => i.label).join("，"),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    setForm(profile);
    setInterests(profile.interests.map((i) => i.label).join("，"));
  }, [profile]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/family/space", {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          avatar: form.avatar?.id || null,
          cover: form.cover?.id || null,
          interests: interests
            .split(/[，,]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 6)
            .map((label) => ({ label })),
        }),
      });
      await refreshProfile();
      setMessage("资料已经保存，公开主页也更新了。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page-content profile-page">
      <div className="page-heading">
        <span className="eyebrow">MY LITTLE WORLD</span>
        <h1>我的资料与主页</h1>
        <p>给小世界，添一点属于自己的样子。</p>
      </div>
      <form className="settings-form" onSubmit={save}>
        <section className="settings-panel">
          <img
            className="settings-cover"
            src={form.cover ? mediaUrl(form.cover.url) : themeAssets.banner}
            crossOrigin={form.cover ? "use-credentials" : undefined}
            alt="当前公开封面"
          />
          <div className="settings-form">
            <MediaPicker
              label="公开头像"
              value={form.avatar}
              onChange={(avatar) => setForm((f) => ({ ...f, avatar }))}
              hint="选择并保存后，这张头像会出现在公开主页。"
            />
            <MediaPicker
              label="公开封面"
              value={form.cover}
              onChange={(cover) => setForm((f) => ({ ...f, cover }))}
              hint="移除照片后使用主题插画；保存后的封面游客也能看到。"
            />
          </div>
        </section>
        <section className="settings-panel settings-form">
          <label>
            公开称呼
            <input
              maxLength={40}
              required
              value={form.displayName}
              onChange={(e) =>
                setForm((f) => ({ ...f, displayName: e.target.value }))
              }
            />
          </label>
          <label>
            一句话介绍自己
            <textarea
              maxLength={300}
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            />
          </label>
          <label>
            兴趣标签
            <input
              value={interests}
              maxLength={110}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="画画，自然观察，旅行"
            />
            <small>用逗号分开，最多 6 个，每个不超过 16 字。</small>
          </label>
        </section>
        <Link className="manage-link" href="/app/themes">
          <span className="icon-tile">
            <Palette size={21} />
          </span>
          <div>
            <strong>主页主题</strong>
            <small>{THEMES.find((t) => t.value === profile.theme)?.name}</small>
          </div>
          <ArrowRight size={18} />
        </Link>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success-message" role="status">
            {message}
          </p>
        )}
        <div className="settings-actions">
          <button
            className="primary-button"
            disabled={busy || profile.canEdit === false}
          >
            <Check size={18} />
            {busy ? "正在保存…" : "保存我的资料"}
          </button>
          <Link className="secondary-button" href="/" target="_blank">
            <Globe2 size={17} />
            预览主页
          </Link>
        </div>
        {profile.canEdit === false && (
          <p className="muted">这个主页由记录人和家长维护。</p>
        )}
      </form>
    </main>
  );
}

export function ThemeSettings() {
  const { profile, refreshProfile } = useSession();
  const [theme, setTheme] = useState(profile.theme),
    [modules, setModules] = useState(profile.modules),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    setTheme(profile.theme);
    setModules(profile.modules);
  }, [profile]);
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/family/space", {
        method: "PATCH",
        body: JSON.stringify({ theme, modules }),
      });
      await refreshProfile();
      setMessage("主题与展示模块已更新。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-form">
      <div className="theme-options">
        {THEMES.map((t) => (
          <button
            type="button"
            className={`theme-option ${theme === t.value ? "selected" : ""}`}
            key={t.value}
            onClick={() => setTheme(t.value)}
            aria-pressed={theme === t.value}
            data-theme={t.value}
          >
            {t.value === "usagi" ? (
              <img src={themeAssets.banner} alt="乌萨奇和朋友们的阳光草地" />
            ) : (
              <div className="theme-option-preview">
                <Flower2 size={58} strokeWidth={1.3} />
              </div>
            )}
            <h3>
              {t.name}
              {theme === t.value && <Check size={21} />}
            </h3>
            <p>{t.description}</p>
            <div className="theme-swatches">
              <span style={{ background: "var(--bg)" }} />
              <span style={{ background: "var(--primary)" }} />
              <span style={{ background: "var(--ink)" }} />
              <span style={{ background: "var(--sage)" }} />
            </div>
          </button>
        ))}
      </div>
      <section className="settings-panel settings-form">
        <h2>公开展示模块</h2>
        {(
          [
            ["timeline", "成长时间轴"],
            ["works", "作品展厅"],
            ["honors", "荣誉与小里程碑"],
            ["projects", "成长项目"],
          ] as const
        ).map(([key, label]) => (
          <label className="checkbox-row" key={key}>
            <input
              type="checkbox"
              checked={modules[key]}
              onChange={(e) =>
                setModules((m) => ({ ...m, [key]: e.target.checked }))
              }
            />
            {label}
          </label>
        ))}
        <small>
          关闭后对应导航与展示页隐藏，已有记录仍按每条记录的可见范围管理。
        </small>
      </section>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      <div className="settings-actions">
        <button
          className="primary-button"
          type="button"
          disabled={busy || profile.canEdit === false}
          onClick={() => void save()}
        >
          <Check size={17} />
          {busy ? "正在保存…" : "保存主题与模块"}
        </button>
        <Link className="secondary-button" href="/" target="_blank">
          预览公开主页
          <Globe2 size={17} />
        </Link>
      </div>
    </div>
  );
}
