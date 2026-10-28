"use client";
import { useEffect, useState } from "react";

type Counts = {
  records: number;
  media: number;
  projects: number;
  history: number;
  pendingCleanup: number;
  unavailableMedia?: { id: number; filename: string }[];
};
type Preview = {
  token: string;
  records: number;
  media: number;
  projects: number;
  settings: boolean;
  expiresAt: string;
};
export function DataManagement({
  apiRoot = "/api",
  onChanged,
}: {
  apiRoot?: string;
  onChanged?: () => Promise<void>;
}) {
  const [counts, setCounts] = useState<Counts>(),
    [preview, setPreview] = useState<Preview>();
  const [clearText, setClearText] = useState(""),
    [restoreText, setRestoreText] = useState("");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [file, setFile] = useState<File>();
  async function call<T>(
    url: string,
    body?: FormData | Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${apiRoot}${url}`, {
      credentials: "include",
      cache: "no-store",
      ...(body
        ? {
            method: "POST",
            body: body instanceof FormData ? body : JSON.stringify(body),
            headers:
              body instanceof FormData
                ? {}
                : { "Content-Type": "application/json" },
          }
        : {}),
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(
        value.error || value.errors?.[0]?.message || "资料管理未完成，请重试。",
      );
    return value;
  }
  const reload = async () => setCounts(await call<Counts>("/family/data"));
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, [apiRoot]);
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const panel = {
    padding: 24,
    border: "1px solid var(--border, #ded8ca)",
    borderRadius: 16,
    marginTop: 20,
  };
  const input = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #b8b2a6",
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 12,
  };
  const button = {
    padding: "10px 16px",
    borderRadius: 8,
    cursor: "pointer",
    minHeight: 44,
  };
  return (
    <div id="data-management" aria-busy={!!busy}>
      <section className="settings-panel settings-form" style={panel}>
        <h2>完整备份与还原</h2>
        {!!counts?.unavailableMedia?.length && (
          <p role="alert" className="error-box">
            有 {counts.unavailableMedia.length} 条旧素材记录缺少实际文件：
            {counts.unavailableMedia.map((m) => m.filename).join("、")}
            。备份会列入缺失报告；补齐文件前，该包无法整体还原。
          </p>
        )}
        <p>
          备份包含当前家庭的记录、全部可用历史、附件及原件、项目、主页、成员资料和服务设置。包含私密内容与
          AI 服务密钥，请私密保管。
        </p>
        <p>
          登录密码和服务器密钥由服务器单独保管。还原保留现有登录账号；备份中缺少的成员会重新建号，需要家长设置新密码。
        </p>
        <a
          className="primary-button"
          style={{ ...button, display: "inline-block" }}
          href={`${apiRoot}/family/export`}
        >
          下载完整备份 ZIP
        </a>
        <hr />
        <label style={{ display: "block" }}>
          选择完整备份 ZIP
          <input
            aria-label="选择完整备份 ZIP"
            style={input}
            type="file"
            accept=".zip,application/zip"
            disabled={!!busy}
            onChange={(e) => {
              setFile(e.target.files?.[0]);
              setPreview(undefined);
              setRestoreText("");
              setMessage("");
            }}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          style={button}
          disabled={!file || !!busy}
          onClick={() =>
            void run("预检备份", async () => {
              const body = new FormData();
              body.append("file", file!);
              setPreview(await call<Preview>("/family/restore/preview", body));
            })
          }
        >
          预检备份
        </button>
        {preview && (
          <div role="status" style={{ marginTop: 16 }}>
            <p>
              校验通过：{preview.records} 条记录、{preview.media} 份素材、
              {preview.projects} 个项目
              {preview.settings ? "，包含家庭设置" : ""}。本次预检将在{" "}
              {new Date(preview.expiresAt).toLocaleTimeString("zh-CN")} 失效。
            </p>
            <p>
              整体还原会替换当前家庭的记录、素材、项目、主页和服务设置，包括备份中的公开状态。请先下载当前资料的备份。
            </p>
            <label style={{ display: "block" }}>
              输入“还原整体备份”后执行
              <input
                style={input}
                value={restoreText}
                disabled={!!busy}
                onChange={(e) => setRestoreText(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              className="primary-button"
              style={button}
              type="button"
              disabled={!!busy || restoreText !== "还原整体备份"}
              onClick={() =>
                void run("还原备份", async () => {
                  const result = await call<{
                    restoredEntries: number;
                    restoredMembers: number;
                    cleanup: { pending: number };
                  }>("/family/restore/apply", {
                    token: preview.token,
                    confirmation: restoreText,
                  });
                  setPreview(undefined);
                  setRestoreText("");
                  setClearText("");
                  setMessage(
                    `已还原 ${result.restoredEntries} 条记录。${result.restoredMembers ? `新建 ${result.restoredMembers} 个成员账号，请为其设置密码。` : ""}${result.cleanup.pending ? `另有 ${result.cleanup.pending} 个旧文件待清理，可点击下方重试。` : ""}`,
                  );
                  await reload();
                  await onChanged?.();
                })
              }
            >
              执行整体还原
            </button>
          </div>
        )}
      </section>
      <section className="settings-panel settings-form" style={panel}>
        <h2>清空所有历史记录以及素材</h2>
        {counts && (
          <p>
            当前家庭有 {counts.records} 条记录、{counts.history} 条历史、
            {counts.media} 份素材、{counts.projects} 个项目。
          </p>
        )}
        <p>
          清空会删除当前家庭的全部记录、版本、项目及云端附件和原件，并移除主页图片。成员账号、主页文字、主题和服务设置会保留。此操作无法撤销，请先下载备份。
        </p>
        <label style={{ display: "block" }}>
          输入“清空所有历史记录以及素材”后执行
          <input
            style={input}
            value={clearText}
            disabled={!!busy}
            onChange={(e) => setClearText(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          style={{ ...button, color: "#a72d27" }}
          disabled={!!busy || clearText !== "清空所有历史记录以及素材"}
          onClick={() =>
            void run("清空资料", async () => {
              const result = await call<{ pending: number }>(
                "/family/data/clear",
                { confirmation: clearText },
              );
              setClearText("");
              setPreview(undefined);
              setMessage(
                result.pending
                  ? `记录已清空，另有 ${result.pending} 个文件待清理，请点击重试。`
                  : "当前家庭的历史记录、项目与素材已全部清空。",
              );
              await reload();
              await onChanged?.();
            })
          }
        >
          清空所有历史记录以及素材
        </button>
        {!!counts?.pendingCleanup && (
          <p>
            有 {counts.pendingCleanup} 个旧文件等待清理。
            <button
              type="button"
              style={button}
              disabled={!!busy}
              onClick={() =>
                void run("清理文件", async () => {
                  const result = await call<{ pending: number }>(
                    "/family/data/cleanup",
                    {},
                  );
                  await reload();
                  setMessage(
                    result.pending
                      ? `还有 ${result.pending} 个文件待清理，请检查存储服务后重试。`
                      : "旧文件已全部清理。",
                  );
                })
              }
            >
              重试清理文件
            </button>
          </p>
        )}
      </section>
      {busy && <p role="status">正在{busy}，请保持此页面打开…</p>}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success-message">
          {message}
        </p>
      )}
    </div>
  );
}
