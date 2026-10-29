"use client";

import { useEffect, useState } from "react";
import { MAX_ENTRY_TAG_OPTIONS } from "@mylife/shared";
import { Check, Plus, X } from "lucide-react";
import { api } from "@/lib/api";

export function TagManager() {
  const [tags, setTags] = useState<string[]>([]);
  const [savedTags, setSavedTags] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(tags) !== JSON.stringify(savedTags);

  useEffect(() => {
    let active = true;
    api<{ tags: string[] }>("/family/entry-tags")
      .then((result) => {
        if (active) {
          setTags(result.tags);
          setSavedTags(result.tags);
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function add() {
    const label = input.trim();
    if (!label) return;
    if (
      tags.some((tag) => tag.toLocaleLowerCase() === label.toLocaleLowerCase())
    ) {
      setError("常用标签中已经有这个标签。");
      return;
    }
    if (tags.length >= MAX_ENTRY_TAG_OPTIONS) {
      setError(`最多添加 ${MAX_ENTRY_TAG_OPTIONS} 个常用标签。`);
      return;
    }
    setTags([...tags, label]);
    setInput("");
    setError("");
    setMessage("");
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ tags: string[] }>("/family/entry-tags", {
        method: "PATCH",
        body: JSON.stringify({ tags }),
      });
      setTags(result.tags);
      setSavedTags(result.tags);
      setMessage("常用标签已保存，家庭成员打开记录编辑器时即可选择。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "暂时无法保存标签。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-panel tag-manager">
      <h2>记录的常用标签</h2>
      <p>给家庭成员准备常用选项。移除选项后，旧记录上已经贴的标签仍会保留。</p>
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
      {loading ? (
        <p className="muted">正在读取标签…</p>
      ) : loaded ? (
        <>
          <div className="tag-manager-list" aria-label="常用标签">
            {tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
                <button
                  type="button"
                  aria-label={`移除${tag}`}
                  disabled={saving}
                  onClick={() => {
                    setTags((current) =>
                      current.filter((value) => value !== tag),
                    );
                    setMessage("");
                    setError("");
                  }}
                >
                  <X size={15} />
                </button>
              </span>
            ))}
            {!tags.length && <span className="muted">还没有常用标签。</span>}
          </div>
          <div className="tag-input-row">
            <input
              aria-label="新常用标签"
              placeholder="例如：征文比赛"
              maxLength={20}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  add();
                }
              }}
            />
            <button
              type="button"
              className="secondary-button"
              disabled={saving || !input.trim()}
              onClick={add}
            >
              <Plus size={16} />
              添加
            </button>
          </div>
          <p className="muted">
            {tags.length} / {MAX_ENTRY_TAG_OPTIONS} 个常用标签 · 每个最多 20 字
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
          >
            <Check size={16} />
            {saving ? "正在保存…" : "保存标签"}
          </button>
        </>
      ) : (
        <button
          className="secondary-button"
          type="button"
          onClick={() => location.reload()}
        >
          重新读取
        </button>
      )}
    </section>
  );
}
