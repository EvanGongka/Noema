"use client";

import { useEffect, useState } from "react";
import { api } from "@ai-note/api-client";
import {
  Check,
  CircleUserRound,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import {
  deleteLocalCredential,
  hasLocalCredential,
  readLocalCredential,
  saveLocalCredential,
} from "@/lib/local-ai-credentials";

type ProviderKind = "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI" | "OLLAMA";

interface ProviderConfig {
  id: string;
  provider: ProviderKind;
  name: string;
  baseUrl: string;
  chatModel: string;
  enabled: boolean;
  isDefaultChat: boolean;
  lastValidatedAt?: string;
  capabilities?: { apiMode?: string };
}

interface FormState {
  provider: ProviderKind;
  name: string;
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  apiMode: "CHAT_COMPLETIONS" | "RESPONSES";
}

const presets: Record<
  ProviderKind,
  Omit<FormState, "provider" | "apiKey" | "name">
> = {
  OPENAI_COMPATIBLE: {
    baseUrl: "https://api.openai.com/v1",
    chatModel: "gpt-4.1-mini",
    apiMode: "CHAT_COMPLETIONS",
  },
  ANTHROPIC: {
    baseUrl: "https://api.anthropic.com",
    chatModel: "claude-sonnet-4-5",
    apiMode: "CHAT_COMPLETIONS",
  },
  GEMINI: {
    baseUrl: "https://generativelanguage.googleapis.com",
    chatModel: "gemini-2.5-flash",
    apiMode: "CHAT_COMPLETIONS",
  },
  OLLAMA: {
    baseUrl: "http://localhost:11434",
    chatModel: "qwen3:8b",
    apiMode: "CHAT_COMPLETIONS",
  },
};

const labels: Record<ProviderKind, string> = {
  OPENAI_COMPATIBLE: "OpenAI / 兼容接口",
  ANTHROPIC: "Anthropic Claude",
  GEMINI: "Google Gemini",
  OLLAMA: "Ollama 本地模型",
};

function emptyForm(provider: ProviderKind = "OPENAI_COMPATIBLE"): FormState {
  return { provider, name: labels[provider], apiKey: "", ...presets[provider] };
}

export function AiSettings({
  user,
  onLogout,
  onError,
}: {
  user: { name: string; email: string };
  onLogout: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [localStatus, setLocalStatus] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string>();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const loaded = await api.request<ProviderConfig[]>("/ai/providers");
    setConfigs(loaded);
    const statuses = await Promise.all(
      loaded.map(
        async (config) =>
          [
            config.id,
            config.provider === "OLLAMA" ||
              (await hasLocalCredential(config.id)),
          ] as const,
      ),
    );
    setLocalStatus(Object.fromEntries(statuses));
  }

  useEffect(() => {
    void load().catch((reason) =>
      onError(reason instanceof Error ? reason.message : "模型配置加载失败"),
    );
  }, []);

  function selectProvider(provider: ProviderKind) {
    setForm({
      provider,
      name: labels[provider],
      apiKey: "",
      ...presets[provider],
    });
  }

  function edit(config: ProviderConfig) {
    setEditingId(config.id);
    setForm({
      provider: config.provider,
      name: config.name,
      baseUrl: config.baseUrl,
      apiKey: "",
      chatModel: config.chatModel,
      apiMode:
        config.capabilities?.apiMode === "RESPONSES"
          ? "RESPONSES"
          : "CHAT_COMPLETIONS",
    });
    setMessage("");
  }

  function reset() {
    setEditingId(undefined);
    setForm(emptyForm());
    setMessage("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy("save");
    setMessage("");
    try {
      if (
        form.provider !== "OLLAMA" &&
        !form.apiKey &&
        (!editingId || !localStatus[editingId])
      ) {
        throw new Error("请在当前浏览器录入 API Key");
      }
      const metadata = {
        provider: form.provider,
        name: form.name,
        baseUrl: form.baseUrl,
        chatModel: form.chatModel,
        apiMode: form.apiMode,
        enabled: true,
      };
      const saved = editingId
        ? await api.request<ProviderConfig>(`/ai/providers/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(metadata),
          })
        : await api.request<ProviderConfig>("/ai/providers", {
            method: "POST",
            body: JSON.stringify({
              ...metadata,
              embeddingModel: null,
              isDefaultChat: configs.length === 0,
              isDefaultEmbedding: false,
            }),
          });
      if (form.apiKey) await saveLocalCredential(saved.id, form.apiKey);
      await load();
      reset();
      setMessage("配置已保存；API Key 仅加密保存在当前浏览器");
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "模型配置保存失败");
    } finally {
      setBusy("");
    }
  }

  async function test(config: ProviderConfig) {
    setBusy(`test:${config.id}`);
    setMessage("");
    try {
      const apiKey = await readLocalCredential(config.id);
      const credentials = apiKey ? [{ configId: config.id, apiKey }] : [];
      const result = await api.request<{
        latencyMs: number;
        modelCount: number;
      }>(`/ai/providers/${config.id}/test`, {
        method: "POST",
        body: JSON.stringify({ credentials }),
      });
      setMessage(
        `连接成功 · ${result.latencyMs}ms · 检测到 ${result.modelCount} 个模型`,
      );
      await load();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "连接测试失败");
    } finally {
      setBusy("");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("删除此模型配置？当前浏览器保存的 API Key 也会清除。"))
      return;
    try {
      await api.request(`/ai/providers/${id}`, { method: "DELETE" });
      await deleteLocalCredential(id);
      await load();
      if (editingId === id) reset();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "删除模型失败");
    }
  }

  async function makeDefault(config: ProviderConfig) {
    try {
      await api.request(`/ai/providers/${config.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefaultChat: true }),
      });
      await load();
      setMessage(`已将“${config.name}”设为默认对话模型`);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "默认模型设置失败");
    }
  }

  return (
    <section className="settings-page">
      <header className="page-heading">
        <small>只连接你自己的模型</small>
        <h1>设置</h1>
        <p>
          模型元数据会同步；API Key 只保存在当前浏览器，不写入服务端数据库。
        </p>
      </header>
      {message && (
        <div className="settings-success">
          <Check size={16} />
          {message}
        </div>
      )}

      <div className="settings-grid">
        <section className="settings-card model-settings">
          <div className="settings-section-title">
            <div>
              <small>BYOK</small>
              <h2>模型配置</h2>
            </div>
            <button onClick={reset}>
              <Plus size={15} />
              新增
            </button>
          </div>
          {!configs.length && (
            <div className="settings-empty">
              <KeyRound />
              <strong>尚未配置模型</strong>
              <p>添加一套自己的模型配置后，才能使用 AI 对话和 AI 标签。</p>
            </div>
          )}
          <div className="provider-list">
            {configs.map((config) => (
              <article
                className={
                  editingId === config.id
                    ? "provider-card active"
                    : "provider-card"
                }
                key={config.id}
                onClick={() => edit(config)}
              >
                <div className="provider-icon">
                  <Server size={18} />
                </div>
                <div className="provider-info">
                  <strong>{config.name}</strong>
                  <span>
                    {labels[config.provider]} · {config.chatModel}
                  </span>
                  <small>
                    {localStatus[config.id]
                      ? "本机密钥可用"
                      : "本机缺少 API Key"}
                    {config.lastValidatedAt
                      ? ` · ${new Date(config.lastValidatedAt).toLocaleDateString("zh-CN")} 验证`
                      : ""}
                  </small>
                  {config.isDefaultChat && <b>默认对话</b>}
                </div>
                <div className="provider-actions">
                  <button
                    title="测试连接"
                    onClick={(event) => {
                      event.stopPropagation();
                      void test(config);
                    }}
                    disabled={busy === `test:${config.id}`}
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    title="删除"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove(config.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {!config.isDefaultChat && (
                  <button
                    className="default-model"
                    onClick={(event) => {
                      event.stopPropagation();
                      void makeDefault(config);
                    }}
                  >
                    设为默认
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>

        <form className="provider-form" onSubmit={save}>
          <div>
            <small>{editingId ? "编辑配置" : "新增配置"}</small>
            <h2>{editingId ? form.name : "连接 AI 模型"}</h2>
          </div>
          <label>
            供应商
            <select
              value={form.provider}
              onChange={(event) =>
                selectProvider(event.target.value as ProviderKind)
              }
            >
              <option value="OPENAI_COMPATIBLE">OpenAI / 兼容接口</option>
              <option value="ANTHROPIC">Anthropic Claude</option>
              <option value="GEMINI">Google Gemini</option>
              <option value="OLLAMA">Ollama</option>
            </select>
          </label>
          <label>
            配置名称
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
            />
          </label>
          <label>
            服务地址
            <input
              value={form.baseUrl}
              onChange={(event) =>
                setForm({ ...form, baseUrl: event.target.value })
              }
              type="url"
              required
            />
          </label>
          <label>
            本机 API Key
            <input
              value={form.apiKey}
              onChange={(event) =>
                setForm({ ...form, apiKey: event.target.value })
              }
              type="password"
              autoComplete="new-password"
              placeholder={
                editingId && localStatus[editingId]
                  ? "留空则保留当前密钥"
                  : form.provider === "OLLAMA"
                    ? "本地 Ollama 可留空"
                    : "仅保存在当前浏览器"
              }
              required={
                form.provider !== "OLLAMA" &&
                (!editingId || !localStatus[editingId])
              }
            />
          </label>
          <label>
            对话模型
            <input
              value={form.chatModel}
              onChange={(event) =>
                setForm({ ...form, chatModel: event.target.value })
              }
              required
            />
          </label>
          {form.provider === "OPENAI_COMPATIBLE" && (
            <label>
              调用协议
              <select
                value={form.apiMode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    apiMode: event.target.value as FormState["apiMode"],
                  })
                }
              >
                <option value="CHAT_COMPLETIONS">Chat Completions</option>
                <option value="RESPONSES">Responses API</option>
              </select>
            </label>
          )}
          <div className="form-actions">
            <button type="button" onClick={reset}>
              取消
            </button>
            <button className="primary-button" disabled={busy === "save"}>
              {busy === "save"
                ? "保存中…"
                : editingId
                  ? "保存修改"
                  : "添加模型"}
            </button>
          </div>
        </form>

        <section className="settings-card account-card">
          <div className="settings-section-title">
            <div>
              <small>ACCOUNT</small>
              <h2>账户</h2>
            </div>
          </div>
          <div className="account-profile">
            <CircleUserRound size={34} />
            <div>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <button className="logout-button" onClick={() => void onLogout()}>
            <LogOut size={15} />
            退出登录
          </button>
        </section>
      </div>
    </section>
  );
}
