"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  BookOpen,
  Plus,
  Settings,
  LogOut,
  ArrowUpRight,
  LockKeyhole,
  Palette,
  UserRound,
  Image,
  LayoutGrid,
} from "lucide-react";
import { Brand } from "./brand";
import { useSession } from "./session";
import { Usagi } from "./theme";
export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession();
  const path = usePathname();
  const managing = path.startsWith("/app/manage");
  const nav = [
    { href: "/app", icon: House, label: "我的空间" },
    { href: "/app/new", icon: Plus, label: "记一件事" },
    { href: "/app/entries", icon: BookOpen, label: "成长时间轴" },
  ];
  const moreNav = [
    { href: "/app/projects", icon: Palette, label: "我的成长项目" },
    { href: "/app/profile", icon: UserRound, label: "我的资料" },
  ];
  const dock = managing
    ? [
        { href: "/app/manage", icon: LayoutGrid, label: "概览" },
        { href: "/app/manage/entries", icon: BookOpen, label: "记录" },
        { href: "/app/manage/media", icon: Image, label: "素材" },
        { href: "/app/manage/settings", icon: Settings, label: "设置" },
      ]
    : nav;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav>
          {[...nav, ...moreNav].map((n) => (
            <Link
              key={n.href}
              className={path === n.href ? "active" : ""}
              href={n.href}
            >
              <n.icon size={19} />
              {n.label}
              {path === n.href && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <Usagi size={100} />
          <p>
            不必每一天都精彩，
            <br />
            每一个你都值得记录。
          </p>
          <small>MY LITTLE WORLD</small>
        </div>
        <div className="sidebar-footer">
          <Link href="/" target="_blank">
            看看我的主页
            <ArrowUpRight size={16} />
          </Link>
          {user.role === "parent" && (
            <Link href="/app/manage">
              <Settings size={16} />
              家长后台
            </Link>
          )}
          <button onClick={() => void logout()}>
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <div className="desktop-breadcrumb">
            我的成长空间 <span>/</span>{" "}
            <strong>
              {managing
                ? "家长后台"
                : path.startsWith("/app/profile") || path === "/app/themes"
                  ? "我的资料"
                  : path.startsWith("/app/projects")
                    ? "成长项目"
                    : path === "/app/new"
                      ? "记一件事"
                      : path === "/app"
                        ? "我的空间"
                        : "成长时间轴"}
            </strong>
          </div>
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="member-info">
            <span className="family-label">
              <LockKeyhole size={13} />
              家庭空间
            </span>
            <span className="avatar desktop-avatar">
              {user.name.slice(0, 1)}
            </span>
            <details className="mobile-account">
              <summary aria-label="打开账号菜单">
                <span className="avatar">{user.name.slice(0, 1)}</span>
              </summary>
              <div className="account-menu">
                <strong>{user.name}</strong>
                <small>
                  {user.role === "parent" ? "家长账号" : "我的成长账号"}
                </small>
                <Link href="/app/profile">我的资料与主页</Link>
                <Link href="/app/projects">我的成长项目</Link>
                {user.role === "parent" && (
                  <Link href="/app/manage">
                    <Settings size={15} />
                    家长后台
                  </Link>
                )}
                <button onClick={() => void logout()}>
                  <LogOut size={15} />
                  退出当前账号
                </button>
              </div>
            </details>
            <span className="member-name">{user.name}</span>
          </div>
        </header>
        {children}
        <footer className="page-footer">
          每一段真实的成长，都有自己的光。
          <span>MADE FOR YOUR LITTLE BIG LIFE</span>
        </footer>
      </div>
      <nav className="mobile-dock" aria-label="主要导航">
        {dock.map((n) => (
          <Link
            key={n.href}
            className={
              path === n.href ||
              (n.href === "/app/manage/settings" &&
                [
                  "/app/manage/themes",
                  "/app/manage/members",
                  "/app/manage/ai",
                ].includes(path))
                ? "active"
                : ""
            }
            href={n.href}
          >
            <n.icon size={21} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
