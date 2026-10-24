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
} from "lucide-react";
import { Brand } from "./brand";
import { useSession } from "./session";
export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession();
  const path = usePathname();
  const nav = [
    { href: "/app", icon: House, label: "我的空间" },
    { href: "/app/new", icon: Plus, label: "记一件事" },
    { href: "/app/entries", icon: BookOpen, label: "成长时间轴" },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav>
          {nav.map((n) => (
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
          <span>✳</span>
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
            <a
              href={
                process.env.NEXT_PUBLIC_CMS_ADMIN_URL ||
                "http://localhost:3001/admin"
              }
              target="_blank"
              rel="noreferrer"
            >
              <Settings size={16} />
              家长后台
            </a>
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
              {path === "/app/new"
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
                {user.role === "parent" && (
                  <a
                    href={
                      process.env.NEXT_PUBLIC_CMS_ADMIN_URL ||
                      "http://localhost:3001/admin"
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Settings size={15} />
                    家长后台
                  </a>
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
        {nav.map((n) => (
          <Link
            key={n.href}
            className={path === n.href ? "active" : ""}
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
