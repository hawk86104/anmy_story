"use client";
import { useEffect, useState } from "react";
import { Check, Mic, Sparkles, X } from "lucide-react";
import type { AISuggestion, Media } from "@mylife/shared";
import { api } from "@/lib/api";

export function AIAssistant({
  title,
  content,
  clientId,
  audio,
  onApply,
}: {
  title: string;
  content: string;
  clientId: string;
  audio: Media[];
  onApply: (title: string, content: string, originalToken?: string) => void;
}) {
  const [enabled, setEnabled] = useState(false),
    [voice, setVoice] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [suggestion, setSuggestion] = useState<AISuggestion | null>(null),
    [original, setOriginal] = useState(""),
    [draft, setDraft] = useState(""),
    [selected, setSelected] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ enabled: boolean; transcription: boolean }>("/ai/status")
      .then((s) => {
        if (active) {
          setEnabled(s.enabled);
          setVoice(s.transcription);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function suggest() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const s = await api<AISuggestion>("/ai/suggest", {
        method: "POST",
        body: JSON.stringify({ title, content, clientId }),
      });
      setOriginal(content);
      setSuggestion(s);
      setDraft(s.content);
      setSelected(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function transcribe(m: Media) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await api<{ text: string }>("/ai/transcribe", {
        method: "POST",
        body: JSON.stringify({ mediaId: m.id }),
      });
      onApply(title, [content, r.text].filter(Boolean).join("\n\n"));
      setMessage("转写文字已放入草稿，原录音继续保留。请检查后再保存。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!enabled) return null;
  return (
    <section className="ai-panel">
      <h3>
        <Sparkles size={18} /> 帮我整理一下
      </h3>
      <p>
        这次点击会把当前标题和正文发送给家长配置的 AI
        服务。建议由你确认，最初的表达会继续保留。
      </p>
      <div className="settings-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={busy || !content.trim()}
          onClick={() => void suggest()}
        >
          <Sparkles size={16} />
          {busy ? "正在整理…" : "看看三个标题与整理建议"}
        </button>
        {voice &&
          audio.map((m) => (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              key={m.id}
              onClick={() => void transcribe(m)}
            >
              <Mic size={16} />
              转写 {m.alt || m.filename}
            </button>
          ))}
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      {suggestion && (
        <>
          <div className="ai-title-options">
            {suggestion.titles.map((t, i) => (
              <button
                type="button"
                className={i === selected ? "selected" : ""}
                key={i}
                onClick={() => setSelected(i)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="ai-comparison">
            <div>
              <h4>这次发送的原文</h4>
              <div className="ai-original">{original}</div>
            </div>
            <div>
              <h4>建议版本，可以继续修改</h4>
              <textarea
                value={draft}
                maxLength={50000}
                aria-label="AI 整理建议"
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                onApply(
                  suggestion.titles[selected] || title,
                  draft,
                  suggestion.originalToken,
                );
                setSuggestion(null);
                setMessage("建议已放入草稿。确认后点击保存，才会形成新版本。");
              }}
            >
              <Check size={16} />
              把这版放进草稿
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setSuggestion(null)}
            >
              <X size={16} />
              保留我的原话
            </button>
          </div>
        </>
      )}
    </section>
  );
}
