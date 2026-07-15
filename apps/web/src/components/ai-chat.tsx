"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@ai-note/api-client";
import {
  Bot,
  Copy,
  FilePlus2,
  KeyRound,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Square,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { MarkdownContent } from "./editor";
import { upsertByCandidateIds } from "./ai-chat-state";
import {
  credentialsForRequest,
  hasLocalCredential,
} from "@/lib/local-ai-credentials";

interface NoteOption {
  id: string;
  title: string;
  version: number;
}

interface ProviderOption {
  id: string;
  name: string;
  provider: "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI" | "OLLAMA";
  chatModel: string;
  isDefaultChat: boolean;
}

interface Conversation {
  id: string;
  title: string;
  mode: "KNOWLEDGE" | "GENERAL";
  scope: "NOTE" | "FOLDER" | "WORKSPACE";
  noteId?: string;
  providerConfigId?: string;
  updatedAt: string;
  _count?: { messages: number };
}

interface Citation {
  id?: string;
  ordinal: number;
  noteId: string;
  blockId: string;
  excerpt: string;
  note?: { title: string; updatedAt: string };
  noteTitle?: string;
}

interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  status: string;
  answerType?: "GROUNDED" | "GENERAL" | "INSUFFICIENT";
  citations: Citation[];
}

interface ConversationDetail extends Conversation {
  messages: ChatMessage[];
}

type StreamData = {
  runId?: string;
  messageId?: string;
  text?: string;
  answer?: string;
  answerType?: ChatMessage["answerType"];
  citation?: Citation;
  message?: string;
};

const quickPrompts = [
  {
    label: "总结全文",
    prompt: "请总结这篇笔记的核心内容，保留关键结论和重要细节。",
  },
  {
    label: "优化表达",
    prompt: "请在不改变事实和原意的前提下，优化这篇笔记的结构与表达。",
  },
  { label: "提取要点", prompt: "请从这篇笔记中提取层次清晰的关键要点。" },
];

export function AiChat({
  notes,
  initialNoteId,
  onOpenNote,
  onNotesChanged,
  onGoSettings,
  onError,
}: {
  notes: NoteOption[];
  initialNoteId?: string;
  onOpenNote: (id: string) => void;
  onNotesChanged: () => Promise<void>;
  onGoSettings: () => void;
  onError: (message: string) => void;
}) {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [credentialStatus, setCredentialStatus] = useState<
    Record<string, boolean>
  >({});
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [detail, setDetail] = useState<ConversationDetail>();
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"GENERAL" | "NOTE">("GENERAL");
  const [noteId, setNoteId] = useState(initialNoteId ?? "");
  const [providerId, setProviderId] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [runId, setRunId] = useState<string>();
  const [savingMessage, setSavingMessage] = useState<ChatMessage>();
  const [saveMode, setSaveMode] = useState<"CREATE" | "APPEND">("CREATE");
  const [targetNoteId, setTargetNoteId] = useState("");
  const [saveTitle, setSaveTitle] = useState("AI 对话整理");
  const abortRef = useRef<AbortController | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedProvider = providers.find(
    (provider) => provider.id === providerId,
  );
  const providerReady = Boolean(
    selectedProvider &&
    (selectedProvider.provider === "OLLAMA" ||
      credentialStatus[selectedProvider.id]),
  );
  const canSend = Boolean(
    providerReady && question.trim() && (mode === "GENERAL" || noteId),
  );
  const selectedNote = useMemo(
    () => notes.find((note) => note.id === noteId),
    [noteId, notes],
  );

  async function loadLists() {
    const [providerData, conversationData] = await Promise.all([
      api.request<ProviderOption[]>("/ai/providers"),
      api.request<Conversation[]>("/chat/conversations"),
    ]);
    const statuses = await Promise.all(
      providerData.map(
        async (provider) =>
          [
            provider.id,
            provider.provider === "OLLAMA" ||
              (await hasLocalCredential(provider.id)),
          ] as const,
      ),
    );
    setProviders(providerData);
    setCredentialStatus(Object.fromEntries(statuses));
    setConversations(conversationData);
    setProviderId((current) =>
      current && providerData.some((provider) => provider.id === current)
        ? current
        : (providerData.find((provider) => provider.isDefaultChat)?.id ??
          providerData[0]?.id ??
          ""),
    );
  }

  useEffect(() => {
    void loadLists().catch((reason) =>
      onError(reason instanceof Error ? reason.message : "对话加载失败"),
    );
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void api
      .request<ConversationDetail>(`/chat/conversations/${activeId}`)
      .then((loaded) => {
        if (cancelled) return;
        setDetail(loaded);
        setMode(loaded.mode === "GENERAL" ? "GENERAL" : "NOTE");
        setNoteId(loaded.noteId ?? "");
        if (loaded.providerConfigId) setProviderId(loaded.providerConfigId);
      })
      .catch((reason) =>
        onError(reason instanceof Error ? reason.message : "对话加载失败"),
      );
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages, streaming]);

  function newConversation() {
    setActiveId(undefined);
    setDetail(undefined);
    setQuestion("");
  }

  async function createConversation() {
    const created = await api.request<Conversation>("/chat/conversations", {
      method: "POST",
      body: JSON.stringify({
        mode: mode === "GENERAL" ? "GENERAL" : "KNOWLEDGE",
        scope: mode === "GENERAL" ? "WORKSPACE" : "NOTE",
        ...(mode === "NOTE" ? { noteId } : {}),
        providerConfigId: providerId,
      }),
    });
    setConversations((current) => [created, ...current]);
    setActiveId(created.id);
    setDetail({ ...created, messages: [] });
    return created.id;
  }

  async function send(override?: string) {
    const content = (override ?? question).trim();
    if (!content || streaming || !providerReady || (mode === "NOTE" && !noteId))
      return;
    setQuestion("");
    try {
      const conversationId = activeId ?? (await createConversation());
      const temporaryId = `temp-${Date.now()}`;
      setDetail((current) =>
        current
          ? {
              ...current,
              messages: [
                ...current.messages,
                {
                  id: `user-${temporaryId}`,
                  role: "USER",
                  content,
                  status: "COMPLETED",
                  citations: [],
                },
                {
                  id: temporaryId,
                  role: "ASSISTANT",
                  content: "",
                  status: "STREAMING",
                  citations: [],
                },
              ],
            }
          : current,
      );
      const credentials = await credentialsForRequest({
        chatConfigId: providerId,
      });
      await consumeStream(
        `/chat/conversations/${conversationId}/messages/stream`,
        { content, credentials, providerConfigId: providerId },
        temporaryId,
        conversationId,
      );
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "AI 回答失败");
      setStreaming(false);
    }
  }

  async function consumeStream(
    path: string,
    body: unknown,
    temporaryId: string,
    conversationId: string,
  ) {
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setRunId(undefined);
    setDetail((current) =>
      current && current.messages.some((message) => message.id === temporaryId)
        ? current
        : {
            ...current!,
            messages: [
              ...(current?.messages ?? []),
              {
                id: temporaryId,
                role: "ASSISTANT",
                content: "",
                status: "STREAMING",
                citations: [],
              },
            ],
          },
    );
    let assistantId = temporaryId;
    try {
      for await (const { event, data } of api.stream<StreamData>(path, {
        method: "POST",
        body: JSON.stringify(body),
        signal: controller.signal,
      })) {
        if (event === "meta") {
          const previousId = assistantId;
          assistantId = data.messageId ?? assistantId;
          setRunId(data.runId);
          setDetail((current) =>
            current
              ? {
                  ...current,
                  messages: upsertByCandidateIds(
                    current.messages,
                    [temporaryId, previousId, assistantId],
                    () => ({
                      id: assistantId,
                      role: "ASSISTANT",
                      content: "",
                      status: "STREAMING",
                      citations: [],
                    }),
                    (message) => ({
                      ...message,
                      id: assistantId,
                      status: "STREAMING",
                    }),
                  ),
                }
              : current,
          );
        }
        if (event === "delta" && data.text) {
          const delta = data.text;
          setDetail((current) =>
            current
              ? {
                  ...current,
                  messages: upsertByCandidateIds(
                    current.messages,
                    [assistantId, temporaryId],
                    () => ({
                      id: assistantId,
                      role: "ASSISTANT",
                      content: delta,
                      status: "STREAMING",
                      citations: [],
                    }),
                    (message) => ({
                      ...message,
                      content: message.content + delta,
                      status: "STREAMING",
                    }),
                  ),
                }
              : current,
          );
        }
        if (event === "citation" && data.citation) {
          const citation = data.citation;
          setDetail((current) =>
            current
              ? {
                  ...current,
                  messages: upsertByCandidateIds(
                    current.messages,
                    [assistantId, temporaryId],
                    () => ({
                      id: assistantId,
                      role: "ASSISTANT",
                      content: "",
                      status: "STREAMING",
                      citations: [citation],
                    }),
                    (message) => ({
                      ...message,
                      citations: message.citations.some(
                        (item) => item.blockId === citation.blockId,
                      )
                        ? message.citations
                        : [...message.citations, citation],
                    }),
                  ),
                }
              : current,
          );
        }
        if (event === "done") {
          const previousId = assistantId;
          assistantId = data.messageId ?? assistantId;
          setDetail((current) =>
            current
              ? {
                  ...current,
                  messages: upsertByCandidateIds(
                    current.messages,
                    [assistantId, previousId, temporaryId],
                    () => ({
                      id: assistantId,
                      role: "ASSISTANT",
                      content: data.answer ?? "",
                      status: "COMPLETED",
                      citations: [],
                    }),
                    (message) => ({
                      ...message,
                      id: assistantId,
                      content: data.answer ?? message.content,
                      answerType: data.answerType,
                      status: "COMPLETED",
                    }),
                  ),
                }
              : current,
          );
        }
        if (event === "error") throw new Error(data.message ?? "AI 生成失败");
      }
      await loadLists();
      setDetail(
        await api.request<ConversationDetail>(
          `/chat/conversations/${conversationId}`,
        ),
      );
    } finally {
      setStreaming(false);
      setRunId(undefined);
      abortRef.current = undefined;
    }
  }

  async function stop() {
    abortRef.current?.abort();
    if (runId)
      await api
        .request(`/chat/runs/${runId}/cancel`, { method: "POST" })
        .catch(() => undefined);
    setStreaming(false);
  }

  async function regenerate(message: ChatMessage) {
    if (streaming || !providerReady || !detail) return;
    try {
      const credentials = await credentialsForRequest({
        chatConfigId: providerId,
      });
      await consumeStream(
        `/chat/messages/${message.id}/regenerate/stream`,
        { credentials, providerConfigId: providerId },
        `temp-${Date.now()}`,
        detail.id,
      );
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "重新生成失败");
    }
  }

  async function removeConversation(conversation: Conversation) {
    if (!window.confirm(`删除对话“${conversation.title}”？`)) return;
    await api.request(`/chat/conversations/${conversation.id}`, {
      method: "DELETE",
    });
    if (activeId === conversation.id) newConversation();
    await loadLists();
  }

  async function saveToNote() {
    if (!savingMessage) return;
    try {
      const body =
        saveMode === "CREATE"
          ? {
              mode: "CREATE",
              title: saveTitle || "AI 对话整理",
              includeQuestion: true,
              includeCitations: true,
            }
          : {
              mode: "APPEND",
              noteId: targetNoteId,
              version: notes.find((note) => note.id === targetNoteId)?.version,
              includeQuestion: true,
              includeCitations: true,
            };
      const note = await api.request<{ id: string }>(
        `/chat/messages/${savingMessage.id}/save-to-note`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setSavingMessage(undefined);
      await onNotesChanged();
      onOpenNote(note.id);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "写入笔记失败");
    }
  }

  return (
    <section className="chat-workbench">
      <aside className="conversation-sidebar">
        <div className="conversation-head">
          <div>
            <small>历史记录</small>
            <strong>AI 对话</strong>
          </div>
          <button title="新对话" onClick={newConversation}>
            <MessageSquarePlus size={17} />
          </button>
        </div>
        <button className="new-conversation" onClick={newConversation}>
          <MessageSquarePlus size={15} />
          新对话
        </button>
        <div className="conversation-list">
          {conversations.map((conversation) => (
            <div
              className={
                activeId === conversation.id
                  ? "conversation-row active"
                  : "conversation-row"
              }
              key={conversation.id}
            >
              <button onClick={() => setActiveId(conversation.id)}>
                <strong>{conversation.title}</strong>
                <span>
                  {conversation.mode === "GENERAL" ? "自由对话" : "基于笔记"} ·{" "}
                  {conversation._count?.messages ?? 0} 条
                </span>
              </button>
              <button
                title="删除对话"
                onClick={() => void removeConversation(conversation)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="chat-main">
        <header className="chat-toolbar">
          <div className="chat-mode" role="group" aria-label="对话模式">
            <button
              className={mode === "GENERAL" ? "active" : ""}
              disabled={Boolean(activeId)}
              onClick={() => setMode("GENERAL")}
            >
              自由对话
            </button>
            <button
              className={mode === "NOTE" ? "active" : ""}
              disabled={Boolean(activeId)}
              onClick={() => setMode("NOTE")}
            >
              基于笔记
            </button>
          </div>
          {mode === "NOTE" && (
            <select
              value={noteId}
              disabled={Boolean(activeId)}
              onChange={(event) => setNoteId(event.target.value)}
            >
              <option value="">选择一篇笔记</option>
              {notes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.title}
                </option>
              ))}
            </select>
          )}
          <select
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
          >
            <option value="">选择已配置模型</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} · {provider.chatModel}
              </option>
            ))}
          </select>
        </header>

        {!providerReady && (
          <div className="model-required">
            <KeyRound size={18} />
            <span>
              {providers.length
                ? "当前模型缺少本机 API Key"
                : "请先配置自己的 AI 模型"}
            </span>
            <button onClick={onGoSettings}>前往设置</button>
          </div>
        )}

        {mode === "NOTE" && !activeId && (
          <div className="quick-prompts">
            <span>
              {selectedNote
                ? `基于《${selectedNote.title}》`
                : "选择笔记后可快速处理"}
            </span>
            {quickPrompts.map((item) => (
              <button
                key={item.label}
                disabled={!noteId || !providerReady}
                onClick={() => void send(item.prompt)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="message-scroll">
          {!detail?.messages.length && (
            <div className="chat-empty">
              <Bot />
              <h2>
                {mode === "GENERAL" ? "开始一次自由对话" : "向选定笔记提问"}
              </h2>
              <p>
                {mode === "GENERAL"
                  ? "随意提问、讨论和创作。"
                  : "可以提问、总结、优化或提取要点。"}
              </p>
            </div>
          )}
          {detail?.messages.map((message) => (
            <article
              className={`chat-message ${message.role.toLowerCase()}`}
              key={message.id}
            >
              <div className="message-avatar">
                {message.role === "USER" ? (
                  <UserRound size={17} />
                ) : (
                  <Bot size={17} />
                )}
              </div>
              <div className="message-body">
                <div className="message-meta">
                  <strong>{message.role === "USER" ? "你" : "AI 助手"}</strong>
                  {message.answerType && (
                    <span className={message.answerType.toLowerCase()}>
                      {message.answerType === "GROUNDED"
                        ? "基于笔记"
                        : message.answerType === "GENERAL"
                          ? "自由对话"
                          : "资料不足"}
                    </span>
                  )}
                </div>
                {message.content ? (
                  <MarkdownContent source={message.content} />
                ) : (
                  <p>正在思考…</p>
                )}
                {message.citations.length > 0 && (
                  <div className="message-citations">
                    {message.citations.map((citation) => (
                      <button
                        key={citation.blockId}
                        onClick={() => onOpenNote(citation.noteId)}
                      >
                        <b>[{citation.ordinal}]</b>
                        <span>
                          {citation.note?.title ??
                            citation.noteTitle ??
                            "来源笔记"}{" "}
                          · {citation.excerpt}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {message.role === "ASSISTANT" &&
                  message.status === "COMPLETED" && (
                    <div className="message-actions">
                      <button
                        onClick={() =>
                          void navigator.clipboard.writeText(message.content)
                        }
                      >
                        <Copy size={13} />
                        复制
                      </button>
                      <button
                        onClick={() => {
                          setSavingMessage(message);
                          setSaveTitle(detail?.title ?? "AI 对话整理");
                          setTargetNoteId(noteId || notes[0]?.id || "");
                        }}
                      >
                        <FilePlus2 size={13} />
                        记入笔记
                      </button>
                      <button onClick={() => void regenerate(message)}>
                        <RefreshCw size={13} />
                        重新生成
                      </button>
                    </div>
                  )}
              </div>
            </article>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="chat-composer">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={
              mode === "NOTE"
                ? "向这篇笔记提问…"
                : "输入消息；Shift + Enter 换行…"
            }
          />
          {streaming ? (
            <button className="stop-button" onClick={() => void stop()}>
              <Square size={15} />
              停止
            </button>
          ) : (
            <button onClick={() => void send()} disabled={!canSend}>
              <Send size={16} />
              发送
            </button>
          )}
        </div>
      </section>

      {savingMessage && (
        <div className="modal-backdrop">
          <section className="save-note-modal">
            <button
              className="modal-close"
              onClick={() => setSavingMessage(undefined)}
            >
              <X size={18} />
            </button>
            <small>整理 AI 回答</small>
            <h2>记入 Markdown 笔记</h2>
            <div className="save-mode">
              <button
                className={saveMode === "CREATE" ? "active" : ""}
                onClick={() => setSaveMode("CREATE")}
              >
                新建笔记
              </button>
              <button
                className={saveMode === "APPEND" ? "active" : ""}
                onClick={() => setSaveMode("APPEND")}
              >
                追加到笔记
              </button>
            </div>
            {saveMode === "CREATE" ? (
              <label>
                笔记标题
                <input
                  value={saveTitle}
                  onChange={(event) => setSaveTitle(event.target.value)}
                />
              </label>
            ) : (
              <label>
                目标笔记
                <select
                  value={targetNoteId}
                  onChange={(event) => setTargetNoteId(event.target.value)}
                >
                  <option value="">请选择</option>
                  {notes.map((note) => (
                    <option key={note.id} value={note.id}>
                      {note.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p>原问题、AI 回答和可用引用会一并保存为 Markdown。</p>
            <button
              className="primary-button"
              disabled={
                (saveMode === "CREATE" && !saveTitle.trim()) ||
                (saveMode === "APPEND" && !targetNoteId)
              }
              onClick={() => void saveToNote()}
            >
              确认写入
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
