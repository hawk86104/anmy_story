"use client";
export default function ErrorPage({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <main className="loading-screen">
      <span className="loading-sprout">✳</span>
      <h1>这页手记暂时没能打开</h1>
      <p>等一下再试试，保存在设备上的草稿仍会留着。</p>
      <button className="primary-button" onClick={retry}>
        重新打开
      </button>
    </main>
  );
}
