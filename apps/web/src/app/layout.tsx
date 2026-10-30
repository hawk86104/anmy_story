import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { PublicNavigationProvider } from "@/components/public-navigation";
import "./globals.css";
import "./usagi.css";
export const metadata: Metadata = {
  title: { default: "MyLife · 把成长，慢慢收藏", template: "%s · MyLife" },
  description:
    "一个属于孩子和家长的成长空间。随手记录，收藏作品，让每一步成长都有迹可循。",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "成长手记" },
  icons: { icon: "/app-icon.svg", apple: "/app-icon.svg" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#FFF9ED",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const analyticsId = process.env.NEXT_PUBLIC_BAIDU_ANALYTICS_ID?.trim() ?? "";
  const hasAnalyticsId = /^[a-f0-9]{32}$/i.test(analyticsId);
  return (
    <html lang="zh-CN">
      <body>
        <PublicNavigationProvider>{children}</PublicNavigationProvider>
        {hasAnalyticsId && (
          <Script id="baidu-analytics" strategy="afterInteractive">{`
          var _hmt = _hmt || [];
          (function() {
            var hm = document.createElement("script");
            hm.src = "https://hm.baidu.com/hm.js?${analyticsId}";
            var s = document.getElementsByTagName("script")[0];
            s.parentNode.insertBefore(hm, s);
          })();
          `}</Script>
        )}
      </body>
    </html>
  );
}
