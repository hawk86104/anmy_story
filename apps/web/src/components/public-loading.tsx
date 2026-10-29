"use client";

import { Brand } from "./brand";
import { SiteShell } from "./site-shell";
import { usePublicNavigation } from "./public-navigation";

export default function PublicLoading() {
  const { profile } = usePublicNavigation();
  const content = (
    <main
      className="site-main public-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p>正在翻开这一页…</p>
      <div className="public-loading-hero" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="public-loading-cards" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </main>
  );

  if (profile) return <SiteShell profile={profile}>{content}</SiteShell>;
  return (
    <div className="theme-scope site" data-theme="usagi">
      <header className="site-header">
        <div className="site-header-inner">
          <Brand href="/" />
        </div>
      </header>
      {content}
    </div>
  );
}
