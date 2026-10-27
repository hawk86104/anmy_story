"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Clock3,
  Flag,
  House,
  Menu,
  Palette,
  LockKeyhole,
} from "lucide-react";
import type { SpaceProfile } from "@mylife/shared";
import { Brand } from "./brand";

export function SiteShell({
  profile,
  children,
}: {
  profile: SpaceProfile;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const nav = [
    { href: "/", label: "主页", mobile: "主页", icon: House, enabled: true },
    {
      href: "/timeline",
      label: "成长时间轴",
      mobile: "时间轴",
      icon: Clock3,
      enabled: profile.modules.timeline,
    },
    {
      href: "/works",
      label: "作品展厅",
      mobile: "作品",
      icon: Palette,
      enabled: profile.modules.works,
    },
    {
      href: "/honors",
      label: "小里程碑",
      mobile: "里程碑",
      icon: Flag,
      enabled: profile.modules.honors,
    },
    {
      href: "/projects",
      label: "成长项目",
      mobile: "项目",
      icon: BookOpen,
      enabled: profile.modules.projects,
    },
  ].filter((n) => n.enabled);
  const selected = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);
  return (
    <div className="theme-scope site" data-theme={profile.theme}>
      <header className="site-header">
        <div className="site-header-inner">
          <Brand href="/" />
          <nav className="site-desktop-nav" aria-label="网站导航">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={selected(n.href) ? "page" : undefined}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <Link className="site-space-link" href="/app">
            我的空间 <ArrowRight size={17} />
          </Link>
          <details className="site-menu">
            <summary aria-label="打开网站菜单">
              <Menu size={23} />
            </summary>
            <div>
              {nav.map((n) => (
                <Link href={n.href} key={n.href}>
                  {n.label}
                </Link>
              ))}
              <Link href="/app">
                进入我的空间 <ArrowRight size={16} />
              </Link>
            </div>
          </details>
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <Brand href="/" />
        <p>
          <LockKeyhole size={13} />{" "}
          这里只分享选择公开的记忆，把其余的温柔留给家人。
        </p>
        <span>my life, my story.</span>
      </footer>
      <nav className="site-mobile-nav" aria-label="手机网站导航">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={selected(n.href) ? "page" : undefined}
          >
            <n.icon size={21} />
            <span>{n.mobile}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
