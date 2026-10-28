import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./usagi.css";
export const metadata: Metadata = {
  title: { default: "MyLife · 把成长，慢慢收藏", template: "%s · MyLife" },
  description:
    "一个属于孩子和家长的成长空间。随手记录，收藏作品，让每一步成长都有迹可循。",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "成长手记" },
  icons: { icon: "/themes/usagi/mark.webp", apple: "/themes/usagi/mark.webp" },
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
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
