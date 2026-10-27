import { ThemeSettings } from "@/components/profile-settings";
export default function Page() {
  return (
    <main className="page-content profile-page">
      <div className="page-heading">
        <h1>主题与主页</h1>
        <p>同样的成长故事，不同的温柔色彩。</p>
      </div>
      <ThemeSettings />
    </main>
  );
}
