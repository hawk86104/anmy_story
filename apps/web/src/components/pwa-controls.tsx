"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, WifiOff } from "lucide-react";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export function PwaControls() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false),
    [hint, setHint] = useState("");
  const [online, setOnline] = useState(true),
    [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const media = matchMedia("(display-mode: standalone)");
    setInstalled(
      media.matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    );
    setOnline(navigator.onLine);
    const before = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
      setHint("");
    };
    const connected = () => setOnline(true),
      disconnected = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", done);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    let active = true;
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator &&
      window.isSecureContext
    ) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          if (!active) return;
          if (registration.waiting) setWaiting(registration.waiting);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (
                active &&
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setWaiting(worker);
            });
          });
        })
        .catch(() => {
          if (active) setHint("暂时未能准备离线入口，联网后重新打开可重试。");
        });
    }
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", done);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, []);
  async function install() {
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
    } else
      setHint(
        /iPhone|iPad|iPod/.test(navigator.userAgent)
          ? "在 Safari 点“分享”，再选“添加到主屏幕”。"
          : "打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。",
      );
  }
  async function update() {
    if (!waiting || busy) return;
    setBusy(true);
    setHint("");
    const pending: Promise<unknown>[] = [];
    window.dispatchEvent(
      new CustomEvent("mylife:flush-drafts", {
        detail: {
          waitUntil: (promise: Promise<unknown>) => pending.push(promise),
        },
      }),
    );
    try {
      await Promise.all(pending);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => location.reload(),
        { once: true },
      );
      waiting.postMessage({ type: "ACTIVATE_UPDATE" });
    } catch (error) {
      setHint(
        (error as Error).message ||
          "设备草稿暂时未能保存，请先保存记录，再更新。",
      );
      setBusy(false);
    }
  }
  return (
    <aside className="pwa-tools" aria-label="安装与离线记事">
      <div>
        {!installed && (
          <button className="text-button" onClick={() => void install()}>
            <Download size={15} /> 添加到主屏幕
          </button>
        )}
        <a className="text-button" href="/offline.html">
          <WifiOff size={15} /> {online ? "离线记事" : "断网中，先在设备上记下"}
        </a>
        {waiting && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void update()}
          >
            <RefreshCw size={15} />
            {busy ? "正在保留草稿…" : "更新并刷新"}
          </button>
        )}
      </div>
      {hint && <p role="status">{hint}</p>}
    </aside>
  );
}
