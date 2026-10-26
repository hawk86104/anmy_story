import Link from "next/link";

export default function PublicEntryNotFound() {
  return (
    <main className="loading-screen">
      <span className="loading-sprout">✳</span>
      <h1>这段记忆暂时无法查看</h1>
      <p>记录尚未公开，或已改为仅自己和家长可见。</p>
      <Link className="primary-button" href="/">
        返回公开手记
      </Link>
    </main>
  );
}
