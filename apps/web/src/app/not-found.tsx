import Link from "next/link";
export default function NotFound() {
  return (
    <main className="loading-screen">
      <span className="loading-sprout">✳</span>
      <h1>这页手记暂时找不到了</h1>
      <p>回到你的成长空间，继续收藏小小的日常。</p>
      <Link className="primary-button" href="/app">
        回到我的空间
      </Link>
    </main>
  );
}
