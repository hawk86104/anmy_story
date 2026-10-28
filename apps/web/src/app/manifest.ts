import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "MyLife · 成长手记",
    short_name: "成长手记",
    description: "随手留下成长的片刻，断网时也能先写一段话。",
    lang: "zh-CN",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#FFF9ED",
    theme_color: "#FFF9ED",
    icons: [
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
