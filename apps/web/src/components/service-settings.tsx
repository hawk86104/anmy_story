"use client";
import { useEffect, useState } from "react";
import { Check, FileJson, LockKeyhole, Sparkles } from "lucide-react";
import type { AIConfiguration } from "@mylife/shared";
import { api } from "@/lib/api";
import { apiUrl } from "@/lib/urls";
import { FamilyDataManagement } from "./family-data-management";
type Settings = AIConfiguration & {
  preserveOriginals: boolean;
  lastExportAt?: string | null;
};
const defaults: Settings = {
  enabled: false,
  endpoint: "",
  model: "",
  transcriptionModel: "",
  keyConfigured: false,
  consent: false,
  preserveOriginals: false,
};
export function ServiceSettings() {
  const [form, setForm] = useState(defaults),
    [key, setKey] = useState(""),
    [clearKey, setClearKey] = useState(false),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    api<Settings>("/family/ai")
      .then((r) => {
        if (active) {
          setForm(r);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await api<Settings>("/family/ai", {
        method: "POST",
        body: JSON.stringify({ ...form, apiKey: key, clearKey }),
      });
      setForm(r);
      setKey("");
      setClearKey(false);
      setMessage("服务与长期保存设置已更新。未开启时不会发送记录。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-form">
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {ready && (
        <form className="settings-form" onSubmit={save}>
          <section className="settings-panel settings-form">
            <h2>
              <Sparkles size={22} />
              整理之前，先保留真实。
            </h2>
            <p>
              只有主动点击整理或转写时，当前正文或选中的录音才会发送给这里配置的服务。建议与原文并排展示，由孩子或家长确认。
            </p>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, enabled: e.target.checked }))
                }
              />
              启用 AI 整理
            </label>
            <label>
              服务接口地址
              <input
                type="url"
                value={form.endpoint}
                required={form.enabled}
                maxLength={1000}
                placeholder="https://你的服务地址/v1"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    endpoint: e.target.value,
                    consent: false,
                  }))
                }
              />
              <small>
                填写支持文字对话和语音转写的兼容接口基础地址，需要公网 HTTPS。
              </small>
            </label>
            <label>
              文字整理模型
              <input
                value={form.model}
                maxLength={200}
                required={form.enabled}
                placeholder="填写服务提供方的模型名称"
                onChange={(e) =>
                  setForm((f) => ({ ...f, model: e.target.value }))
                }
              />
            </label>
            <label>
              语音转写模型（选填）
              <input
                value={form.transcriptionModel}
                maxLength={200}
                placeholder="留空时只提供文字整理"
                onChange={(e) =>
                  setForm((f) => ({ ...f, transcriptionModel: e.target.value }))
                }
              />
            </label>
            <label>
              服务密钥
              <input
                type="password"
                autoComplete="off"
                value={key}
                maxLength={4096}
                required={form.enabled && !form.keyConfigured}
                placeholder={
                  form.keyConfigured
                    ? "已配置，留空保留现有密钥"
                    : "填写服务提供方的密钥"
                }
                onChange={(e) => setKey(e.target.value)}
              />
              <small>
                <LockKeyhole size={12} />
                密钥加密保存在后台，保存后不会回显。
              </small>
            </label>
            {form.keyConfigured && (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={clearKey}
                  onChange={(e) => {
                    setClearKey(e.target.checked);
                    if (e.target.checked) {
                      setForm((f) => ({ ...f, enabled: false }));
                      setKey("");
                    }
                  }}
                />
                清除已有密钥并关闭 AI
              </label>
            )}
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, consent: e.target.checked }))
                }
              />
              我已了解服务提供方的数据处理方式，授权在主动使用时发送选中的正文或录音。
            </label>
          </section>
          <section className="settings-panel settings-form">
            <h2>重要的素材，留一份原件。</h2>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.preserveOriginals}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    preserveOriginals: e.target.checked,
                  }))
                }
              />
              以后新上传的照片与视频，同时保留上传原件
            </label>
            <small>
              原件供家长下载和备份，会增加存储占用；以前未保留的原件无法补回。公开页面继续使用适合浏览的版本。
            </small>
          </section>
          <button className="primary-button" disabled={busy}>
            <Check size={17} />
            {busy ? "正在保存…" : "保存服务与长期保存设置"}
          </button>
        </form>
      )}
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      <FamilyDataManagement
        onChanged={async () => setForm(await api<Settings>("/family/ai"))}
      />
      <section className="settings-panel settings-form">
        <h2>另存可读数据</h2>
        <p>
          完整 ZIP 包含记录、最初表达、作品附件、项目、可用版本和
          Markdown。只保存在家庭空间的内容也会包含在内，请妥善保管。
        </p>
        <div className="settings-actions archive-downloads">
          <a
            className="secondary-button"
            href={apiUrl("/family/export?format=json")}
          >
            <FileJson size={17} />
            仅导出 JSON 数据
          </a>
        </div>
        {form.lastExportAt && (
          <small>
            最近发起导出：{new Date(form.lastExportAt).toLocaleString("zh-CN")}
          </small>
        )}
        <small>JSON 仅包含索引与设置；完整还原请使用上方的 ZIP 备份。</small>
        <details className="restore-instructions">
          <summary>备份与恢复说明</summary>
          <p>
            ZIP 可以解压后阅读 Markdown
            和附件，也可在上方预检并整体还原。整体还原保留备份中的公开状态。
          </p>
          <p>
            服务器环境变量和登录密码需要单独备份。请妥善保管下载文件，避免公开分享。
          </p>
        </details>
      </section>
    </div>
  );
}
