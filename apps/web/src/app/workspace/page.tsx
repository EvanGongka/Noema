"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, api } from "@ai-note/api-client";
import {
  ArrowLeft,
  Bot,
  Check,
  CircleUserRound,
  FileInput,
  Library,
  LogOut,
  Plus,
  Search,
  Settings,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { MarkdownEditor } from "@/components/editor";
import { AiChat } from "@/components/ai-chat";
import { AiSettings } from "@/components/ai-settings";
import { credentialsForRequest } from "@/lib/local-ai-credentials";
import {
  markdownDocument,
  mergeTagIds,
  noteMatches,
  type NoteTag,
} from "@/lib/note-utils";

type View = "notes" | "chat" | "settings";

export interface User {
  userId: string;
  workspaceId: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

export interface Note {
  id: string;
  title: string;
  plainText: string;
  content: Record<string, unknown>;
  version: number;
  updatedAt: string;
  tags?: Array<{ tag: NoteTag }>;
}

const navItems = [
  { id: "notes" as const, label: "笔记", icon: Library },
  { id: "chat" as const, label: "AI 对话", icon: Bot },
  { id: "settings" as const, label: "设置", icon: Settings },
];

export default function WorkspacePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [view, setView] = useState<View>("notes");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [tagName, setTagName] = useState("");
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<string[]>();
  const [suggestingTags, setSuggestingTags] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingSaves = useRef(new Map<string, Note>());
  const activeSaves = useRef(new Set<string>());

  const selected = useMemo(
    () => notes.find((note) => note.id === selectedId),
    [notes, selectedId],
  );
  const visibleNotes = useMemo(
    () =>
      notes.filter((note) => noteMatches(note, query, tagFilter || undefined)),
    [notes, query, tagFilter],
  );

  const loadNotes = useCallback(async () => {
    const data = await api.request<Note[]>("/notes");
    setNotes(data);
    setSelectedId((current) =>
      current && data.some((note) => note.id === current)
        ? current
        : data[0]?.id,
    );
  }, []);

  const loadTags = useCallback(async () => {
    setTags(await api.request<NoteTag[]>("/catalog/tags"));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const me = await api.request<User>("/auth/me");
        setUser(me);
        await Promise.all([loadNotes(), loadTags()]);
      } catch {
        router.replace("/login");
      }
    })();
  }, [loadNotes, loadTags, router]);

  async function createNote() {
    try {
      const note = await api.request<Note>("/notes", {
        method: "POST",
        body: JSON.stringify({
          title: "无标题笔记",
          content: markdownDocument(""),
          plainText: "",
          status: "ACTIVE",
          aiEnabled: true,
          tagIds: [],
        }),
      });
      const created = { ...note, tags: [] };
      setNotes((current) => [created, ...current]);
      setSelectedId(note.id);
      setView("notes");
      setMobileEditorOpen(true);
    } catch (reason) {
      showError(reason, "新建笔记失败");
    }
  }

  function updateDraft(patch: Partial<Note>) {
    if (!selected) return;
    const draft = { ...selected, ...patch };
    setNotes((current) =>
      current.map((note) => (note.id === draft.id ? draft : note)),
    );
    pendingSaves.current.set(draft.id, draft);
    setSaving("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushSave(draft.id), 800);
  }

  async function flushSave(noteId: string) {
    if (activeSaves.current.has(noteId)) return;
    const draft = pendingSaves.current.get(noteId);
    if (!draft) return;
    pendingSaves.current.delete(noteId);
    activeSaves.current.add(noteId);
    try {
      const updated = await api.request<Note>(`/notes/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: draft.title,
          content: markdownDocument(draft.plainText),
          plainText: draft.plainText,
          status: "ACTIVE",
          aiEnabled: true,
          tagIds: draft.tags?.map((entry) => entry.tag.id) ?? [],
          version: draft.version,
        }),
      });
      setNotes((current) =>
        current.map((note) =>
          note.id === draft.id
            ? {
                ...note,
                version: updated.version,
                updatedAt: updated.updatedAt,
              }
            : note,
        ),
      );
      const pending = pendingSaves.current.get(noteId);
      if (pending)
        pendingSaves.current.set(noteId, {
          ...pending,
          version: updated.version,
        });
      setSaving(pending ? "saving" : "saved");
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 409) {
        const latest = await api
          .request<Note>(`/notes/${draft.id}`)
          .catch(() => undefined);
        if (latest) {
          const rebased = { ...draft, version: latest.version };
          setNotes((current) =>
            current.map((note) => (note.id === draft.id ? rebased : note)),
          );
        }
        setError(
          "笔记在其他位置更新；本地 Markdown 已保留，请继续编辑后重新保存。",
        );
      } else {
        showError(reason, "保存失败");
      }
      setSaving("error");
    } finally {
      activeSaves.current.delete(noteId);
      if (pendingSaves.current.has(noteId)) void flushSave(noteId);
    }
  }

  async function deleteNote() {
    if (
      !selected ||
      !window.confirm(`删除笔记“${selected.title || "无标题笔记"}”？`)
    )
      return;
    try {
      await api.request(`/notes/${selected.id}`, { method: "DELETE" });
      const remaining = notes.filter((note) => note.id !== selected.id);
      setNotes(remaining);
      setSelectedId(remaining[0]?.id);
      setMobileEditorOpen(false);
    } catch (reason) {
      showError(reason, "删除笔记失败");
    }
  }

  async function importMarkdown(file?: File) {
    if (!file) return;
    try {
      const note = await api.request<Note>("/transfer/import", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          content: await file.text(),
        }),
      });
      await loadNotes();
      setSelectedId(note.id);
      setMobileEditorOpen(true);
    } catch (reason) {
      showError(reason, "Markdown 导入失败");
    }
  }

  function toggleTag(tag: NoteTag) {
    if (!selected) return;
    const entries = selected.tags ?? [];
    updateDraft({
      tags: entries.some((entry) => entry.tag.id === tag.id)
        ? entries.filter((entry) => entry.tag.id !== tag.id)
        : [...entries, { tag }],
    });
  }

  async function createTag() {
    const name = tagName.trim();
    if (!name) return;
    try {
      const existing = tags.find(
        (tag) =>
          tag.name.toLocaleLowerCase("zh-CN") ===
          name.toLocaleLowerCase("zh-CN"),
      );
      const tag =
        existing ??
        (await api.request<NoteTag>("/catalog/tags", {
          method: "POST",
          body: JSON.stringify({ name, color: "#596B5B" }),
        }));
      if (!existing) setTags((current) => [...current, tag]);
      setTagName("");
      if (!selected?.tags?.some((entry) => entry.tag.id === tag.id))
        toggleTag(tag);
    } catch (reason) {
      showError(reason, "创建标签失败");
    }
  }

  async function generateTags() {
    if (!selected || !selected.plainText.trim()) return;
    setSuggestingTags(true);
    try {
      if (pendingSaves.current.has(selected.id)) await flushSave(selected.id);
      const credentials = await credentialsForRequest({
        includeDefaultChat: true,
      });
      const result = await api.request<{ tags: string[] }>(
        `/ai/notes/${selected.id}/tag-suggestions`,
        { method: "POST", body: JSON.stringify({ credentials }) },
      );
      setSuggestedTags(result.tags);
    } catch (reason) {
      showError(reason, "AI 标签生成失败，请先在设置中配置模型和本机密钥");
    } finally {
      setSuggestingTags(false);
    }
  }

  async function applySuggestedTags() {
    if (!selected || !suggestedTags) return;
    try {
      const resolved: NoteTag[] = [];
      for (const name of suggestedTags) {
        const existing = tags.find(
          (tag) =>
            tag.name.toLocaleLowerCase("zh-CN") ===
            name.toLocaleLowerCase("zh-CN"),
        );
        resolved.push(
          existing ??
            (await api.request<NoteTag>("/catalog/tags", {
              method: "POST",
              body: JSON.stringify({ name, color: "#596B5B" }),
            })),
        );
      }
      const byId = new Map([...tags, ...resolved].map((tag) => [tag.id, tag]));
      const currentIds = selected.tags?.map((entry) => entry.tag.id) ?? [];
      const nextIds = mergeTagIds(
        currentIds,
        resolved.map((tag) => tag.id),
      );
      setTags([...byId.values()]);
      updateDraft({ tags: nextIds.map((id) => ({ tag: byId.get(id)! })) });
      setSuggestedTags(undefined);
    } catch (reason) {
      showError(reason, "标签写入失败");
    }
  }

  async function logout() {
    await api
      .request("/auth/logout", { method: "POST" })
      .catch(() => undefined);
    router.replace("/login");
  }

  function showError(reason: unknown, fallback: string) {
    setError(reason instanceof Error ? reason.message : fallback);
  }

  if (!user) {
    return (
      <main className="app-loading">
        <div className="brand-mark">知</div>
        <p>正在打开知流…</p>
      </main>
    );
  }

  return (
    <main className="workspace-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span>知</span>
          <strong>知流</strong>
        </div>
        <nav aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => setView(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <CircleUserRound />
          <div>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
          <button title="退出" onClick={() => void logout()}>
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <section className="workspace-main">
        {error && (
          <div className="global-error">
            {error}
            <button onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}

        {view === "notes" && (
          <section
            className={`notes-layout ${mobileEditorOpen ? "editor-open" : ""}`}
          >
            <aside className="note-list">
              <div className="note-list-header">
                <div>
                  <small>Markdown 笔记</small>
                  <h1>笔记</h1>
                </div>
                <button title="新建笔记" onClick={() => void createNote()}>
                  <Plus size={18} />
                </button>
              </div>
              <label className="note-search">
                <Search size={15} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索标题、正文或标签"
                />
              </label>
              <div className="tag-filters">
                <button
                  className={!tagFilter ? "active" : ""}
                  onClick={() => setTagFilter("")}
                >
                  全部
                </button>
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    className={tagFilter === tag.id ? "active" : ""}
                    onClick={() =>
                      setTagFilter(tag.id === tagFilter ? "" : tag.id)
                    }
                  >
                    #{tag.name}
                  </button>
                ))}
              </div>
              <label className="import-markdown">
                <FileInput size={15} />
                导入 Markdown
                <input
                  type="file"
                  accept=".md,.markdown,text/markdown"
                  onChange={(event) =>
                    void importMarkdown(event.target.files?.[0])
                  }
                />
              </label>
              <div className="note-rows">
                {visibleNotes.map((note) => (
                  <button
                    className={
                      selectedId === note.id ? "note-row active" : "note-row"
                    }
                    key={note.id}
                    onClick={() => {
                      setSelectedId(note.id);
                      setMobileEditorOpen(true);
                    }}
                  >
                    <strong>{note.title || "无标题笔记"}</strong>
                    <p>{note.plainText || "开始写下第一句话…"}</p>
                    <div>
                      <time>
                        {new Date(note.updatedAt).toLocaleDateString("zh-CN")}
                      </time>
                      {note.tags?.slice(0, 2).map((entry) => (
                        <span key={entry.tag.id}>#{entry.tag.name}</span>
                      ))}
                    </div>
                  </button>
                ))}
                {!visibleNotes.length && (
                  <div className="list-empty">
                    没有匹配的笔记。
                    <br />
                    换个关键词，或新建一篇。
                  </div>
                )}
              </div>
            </aside>

            <article className="note-editor-pane">
              {selected ? (
                <>
                  <header className="note-editor-header">
                    <button
                      className="mobile-note-back"
                      onClick={() => setMobileEditorOpen(false)}
                    >
                      <ArrowLeft size={17} />
                      返回
                    </button>
                    <span className={`save-state ${saving}`}>
                      {saving === "saving" ? (
                        "保存中…"
                      ) : saving === "error" ? (
                        "保存失败"
                      ) : saving === "saved" ? (
                        <>
                          <Check size={13} />
                          已保存
                        </>
                      ) : (
                        ""
                      )}
                    </span>
                    <button
                      className="danger-icon"
                      title="删除笔记"
                      onClick={() => void deleteNote()}
                    >
                      <Trash2 size={16} />
                    </button>
                  </header>
                  <div className="note-editor-scroll">
                    <input
                      className="note-title"
                      value={selected.title}
                      onChange={(event) =>
                        updateDraft({ title: event.target.value })
                      }
                      placeholder="无标题笔记"
                    />
                    <div className="note-tags">
                      <Tag size={14} />
                      {tags.map((tag) => (
                        <button
                          key={tag.id}
                          className={
                            selected.tags?.some(
                              (entry) => entry.tag.id === tag.id,
                            )
                              ? "active"
                              : ""
                          }
                          onClick={() => toggleTag(tag)}
                        >
                          #{tag.name}
                        </button>
                      ))}
                      <div className="new-tag-control">
                        <input
                          value={tagName}
                          onChange={(event) => setTagName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void createTag();
                            }
                          }}
                          placeholder="新标签"
                          maxLength={40}
                        />
                        <button
                          onClick={() => void createTag()}
                          disabled={!tagName.trim()}
                        >
                          添加
                        </button>
                      </div>
                      <button
                        className="ai-tag-button"
                        onClick={() => void generateTags()}
                        disabled={suggestingTags || !selected.plainText.trim()}
                      >
                        <Sparkles size={13} />
                        {suggestingTags ? "生成中…" : "AI 生成标签"}
                      </button>
                    </div>
                    <MarkdownEditor
                      key={selected.id}
                      source={selected.plainText}
                      onChange={(plainText) =>
                        updateDraft({
                          plainText,
                          content: markdownDocument(plainText),
                        })
                      }
                    />
                  </div>
                </>
              ) : (
                <div className="large-empty">
                  <Library />
                  <h2>选择一篇笔记</h2>
                  <p>或创建一篇新的 Markdown 笔记。</p>
                </div>
              )}
            </article>
          </section>
        )}

        {view === "chat" && (
          <AiChat
            notes={notes}
            initialNoteId={selectedId}
            onOpenNote={(id) => {
              setSelectedId(id);
              setView("notes");
              setMobileEditorOpen(true);
            }}
            onNotesChanged={loadNotes}
            onGoSettings={() => setView("settings")}
            onError={(message) => setError(message)}
          />
        )}

        {view === "settings" && (
          <AiSettings
            user={user}
            onLogout={logout}
            onError={(message) => setError(message)}
          />
        )}
      </section>

      <nav className="mobile-tabbar" aria-label="移动端主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => setView(item.id)}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {suggestedTags && (
        <div className="modal-backdrop">
          <section className="tag-suggestion-modal">
            <button
              className="modal-close"
              onClick={() => setSuggestedTags(undefined)}
            >
              <X size={18} />
            </button>
            <small>AI 标签建议</small>
            <h2>确认要添加的标签</h2>
            <p>建议只会追加，不会覆盖现有标签。</p>
            <div className="suggested-tag-list">
              {suggestedTags.length ? (
                suggestedTags.map((name) => <span key={name}>#{name}</span>)
              ) : (
                <em>没有生成合适的标签</em>
              )}
            </div>
            <button
              className="primary-button"
              disabled={!suggestedTags.length}
              onClick={() => void applySuggestedTags()}
            >
              确认添加
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
