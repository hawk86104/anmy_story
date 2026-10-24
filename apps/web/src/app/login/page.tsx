"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { Brand } from "@/components/brand";
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/users/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const to = new URLSearchParams(location.search).get("next");
      router.replace(
        to?.startsWith("/app") && !to.startsWith("//") ? to : "/app/new",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败，请重试。");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-story">
        <Brand href="/" />
        <div>
          <span className="eyebrow">A LITTLE TODAY. A LIFETIME TOMORROW.</span>
          <h1>
            长大的路上，
            <br />
            把自己收藏好。
          </h1>
          <p>
            一张照片，一次尝试，一点小小的进步。
            <br />
            这里，装着正在长大的你。
          </p>
          <div className="orbit-art" aria-hidden="true">
            <span className="art-sun">✳</span>
            <span className="art-book">
              mylife<small>我的成长手记</small>
            </span>
            <span className="art-star">✧</span>
            <span className="art-leaf">◒</span>
          </div>
        </div>
        <small>属于你，也属于未来的你。</small>
      </div>
      <section className="login-form-card">
        <span className="welcome-mark">✳</span>
        <h2>欢迎回到我的小世界</h2>
        <p>用自己的账号，继续收藏成长。</p>
        <form onSubmit={submit}>
          <label>
            邮箱
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="你的登录邮箱"
            />
          </label>
          <label>
            密码
            <div className="password-input">
              <input
                type={show ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={show ? "隐藏密码" : "显示密码"}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={loading}>
            {loading ? "正在打开…" : "进入我的成长空间"}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="privacy-note">
          <LockKeyhole size={14} />
          只有你和家人，能看到家庭记录
        </p>
        <small className="login-help">首次使用请由家长建立家庭账号。</small>
      </section>
    </main>
  );
}
