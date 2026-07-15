"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bold,
  ChevronDown,
  Code,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  PencilLine,
  Quote,
  SquareCode,
  Strikethrough,
  Table2,
} from "lucide-react";
import {
  applyMarkdownFormat,
  markdownActionForShortcut,
  type MarkdownFormatAction,
  type MarkdownFormatOptions,
} from "@/lib/markdown-format";

const MarkdownPreview = dynamic(
  () => import("./markdown-preview").then((module) => module.MarkdownPreview),
  {
    ssr: false,
    loading: () => <p className="markdown-preview-loading">正在生成预览…</p>,
  },
);

export function MarkdownContent({ source }: { source: string }) {
  return <MarkdownPreview source={source} />;
}

type FormatTool = {
  action: MarkdownFormatAction;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  ariaKeyShortcuts?: string;
};

const formatTools: FormatTool[] = [
  {
    action: "heading1",
    label: "一级标题",
    icon: Heading1,
    shortcut: "⌘/Ctrl+Alt+1",
    ariaKeyShortcuts: "Meta+Alt+1 Control+Alt+1",
  },
  {
    action: "heading2",
    label: "二级标题",
    icon: Heading2,
    shortcut: "⌘/Ctrl+Alt+2",
    ariaKeyShortcuts: "Meta+Alt+2 Control+Alt+2",
  },
  {
    action: "heading3",
    label: "三级标题",
    icon: Heading3,
    shortcut: "⌘/Ctrl+Alt+3",
    ariaKeyShortcuts: "Meta+Alt+3 Control+Alt+3",
  },
  {
    action: "bold",
    label: "粗体",
    icon: Bold,
    shortcut: "⌘/Ctrl+B",
    ariaKeyShortcuts: "Meta+B Control+B",
  },
  {
    action: "italic",
    label: "斜体",
    icon: Italic,
    shortcut: "⌘/Ctrl+I",
    ariaKeyShortcuts: "Meta+I Control+I",
  },
  {
    action: "strikethrough",
    label: "删除线",
    icon: Strikethrough,
    shortcut: "⌘/Ctrl+Shift+X",
    ariaKeyShortcuts: "Meta+Shift+X Control+Shift+X",
  },
  {
    action: "inlineCode",
    label: "行内代码",
    icon: Code,
    shortcut: "⌘/Ctrl+E",
    ariaKeyShortcuts: "Meta+E Control+E",
  },
  {
    action: "link",
    label: "链接",
    icon: Link,
    shortcut: "⌘/Ctrl+K",
    ariaKeyShortcuts: "Meta+K Control+K",
  },
  { action: "unorderedList", label: "无序列表", icon: List },
  { action: "orderedList", label: "有序列表", icon: ListOrdered },
  { action: "taskList", label: "任务列表", icon: ListChecks },
  { action: "quote", label: "引用", icon: Quote },
  { action: "table", label: "表格", icon: Table2 },
  { action: "codeBlock", label: "代码块", icon: SquareCode },
  { action: "divider", label: "分隔线", icon: Minus },
];

const codeLanguages = [
  { value: "", label: "纯文本" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "bash", label: "Bash / Shell" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "swift", label: "Swift" },
  { value: "sql", label: "SQL" },
  { value: "markdown", label: "Markdown" },
] as const;

const tablePickerSize = 8;

export function MarkdownEditor({
  source,
  onChange,
}: {
  source: string;
  onChange: (source: string) => void;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [codeLanguageOpen, setCodeLanguageOpen] = useState(false);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tableSize, setTableSize] = useState({ rows: 3, columns: 3 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionFrameRef = useRef<number | null>(null);
  const codeLanguageRef = useRef<HTMLDivElement>(null);
  const tablePickerRef = useRef<HTMLDivElement>(null);

  const cancelSelectionRestore = useCallback(() => {
    if (selectionFrameRef.current === null) return;
    cancelAnimationFrame(selectionFrameRef.current);
    selectionFrameRef.current = null;
  }, []);

  useEffect(() => cancelSelectionRestore, [cancelSelectionRestore]);

  useEffect(() => {
    if (!codeLanguageOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (
        codeLanguageRef.current &&
        !codeLanguageRef.current.contains(event.target as Node)
      ) {
        setCodeLanguageOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCodeLanguageOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [codeLanguageOpen]);

  useEffect(() => {
    if (!tablePickerOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (
        tablePickerRef.current &&
        !tablePickerRef.current.contains(event.target as Node)
      ) {
        setTablePickerOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTablePickerOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [tablePickerOpen]);

  const applyFormat = useCallback(
    (action: MarkdownFormatAction, options?: MarkdownFormatOptions) => {
      cancelSelectionRestore();
      const textarea = textareaRef.current;
      const currentSource = textarea?.value ?? source;
      const selectionStart = textarea?.selectionStart ?? currentSource.length;
      const selectionEnd = textarea?.selectionEnd ?? selectionStart;
      const result = applyMarkdownFormat(
        currentSource,
        selectionStart,
        selectionEnd,
        action,
        options,
      );

      onChange(result.source);
      selectionFrameRef.current = requestAnimationFrame(() => {
        selectionFrameRef.current = null;
        const currentTextarea = textareaRef.current;
        if (!currentTextarea) return;
        currentTextarea.focus();
        currentTextarea.setSelectionRange(
          result.selectionStart,
          result.selectionEnd,
        );
      });
    },
    [cancelSelectionRestore, onChange, source],
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const action = markdownActionForShortcut(event);
    if (!action) return;
    event.preventDefault();
    applyFormat(action);
  };

  return (
    <section className="markdown-editor">
      <div
        className="markdown-tabs"
        role="tablist"
        aria-label="Markdown 编辑模式"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "edit"}
          className={mode === "edit" ? "active" : ""}
          onClick={() => setMode("edit")}
        >
          <PencilLine size={14} />
          编辑
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "preview"}
          className={mode === "preview" ? "active" : ""}
          onClick={() => {
            setCodeLanguageOpen(false);
            setTablePickerOpen(false);
            setMode("preview");
          }}
        >
          <Eye size={14} />
          预览
        </button>
        <span>Markdown</span>
      </div>
      {mode === "edit" ? (
        <>
          <div
            className="markdown-format-toolbar"
            role="toolbar"
            aria-label="Markdown 快捷格式"
          >
            {formatTools.map((tool) => {
              const Icon = tool.icon;
              const title = tool.shortcut
                ? `${tool.label}（${tool.shortcut}）`
                : tool.label;
              if (tool.action === "table") {
                return (
                  <div
                    key={tool.action}
                    ref={tablePickerRef}
                    className="table-picker-control"
                  >
                    <button
                      type="button"
                      data-format-action={tool.action}
                      aria-label={tool.label}
                      aria-haspopup="dialog"
                      aria-expanded={tablePickerOpen}
                      title="选择表格行列数"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setCodeLanguageOpen(false);
                        setTablePickerOpen((open) => !open);
                      }}
                    >
                      <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                    {tablePickerOpen && (
                      <div
                        className="table-size-menu"
                        role="dialog"
                        aria-label="选择表格大小"
                      >
                        <strong>
                          {tableSize.rows} 行 × {tableSize.columns} 列
                        </strong>
                        <div className="table-size-grid" role="grid">
                          {Array.from(
                            { length: tablePickerSize },
                            (_, rowIndex) =>
                              Array.from(
                                { length: tablePickerSize },
                                (_, columnIndex) => {
                                  const rows = rowIndex + 1;
                                  const columns = columnIndex + 1;
                                  const selected =
                                    rows <= tableSize.rows &&
                                    columns <= tableSize.columns;
                                  return (
                                    <button
                                      key={`${rows}-${columns}`}
                                      type="button"
                                      role="gridcell"
                                      className={selected ? "selected" : ""}
                                      aria-label={`${rows} 行 × ${columns} 列`}
                                      aria-selected={selected}
                                      onMouseDown={(event) =>
                                        event.preventDefault()
                                      }
                                      onMouseEnter={() =>
                                        setTableSize({ rows, columns })
                                      }
                                      onFocus={() =>
                                        setTableSize({ rows, columns })
                                      }
                                      onClick={() => {
                                        applyFormat("table", {
                                          tableRows: rows,
                                          tableColumns: columns,
                                        });
                                        setTablePickerOpen(false);
                                      }}
                                    />
                                  );
                                },
                              ),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
              if (tool.action === "codeBlock") {
                return (
                  <div
                    key={tool.action}
                    ref={codeLanguageRef}
                    className="code-block-control"
                  >
                    <button
                      type="button"
                      className="code-block-main"
                      data-format-action={tool.action}
                      aria-label={tool.label}
                      title="代码块（无语言）"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyFormat(tool.action)}
                    >
                      <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="code-language-toggle"
                      aria-label="选择代码语言"
                      aria-haspopup="menu"
                      aria-expanded={codeLanguageOpen}
                      title="选择代码语言"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setTablePickerOpen(false);
                        setCodeLanguageOpen((open) => !open);
                      }}
                    >
                      <ChevronDown
                        size={11}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </button>
                    {codeLanguageOpen && (
                      <div
                        className="code-language-menu"
                        role="menu"
                        aria-label="常用代码语言"
                      >
                        {codeLanguages.map((language) => (
                          <button
                            key={language.value || "plain"}
                            type="button"
                            role="menuitem"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              applyFormat("codeBlock", {
                                codeLanguage: language.value,
                              });
                              setCodeLanguageOpen(false);
                            }}
                          >
                            {language.label}
                            <code>{language.value || "text"}</code>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <button
                  key={tool.action}
                  type="button"
                  data-format-action={tool.action}
                  aria-label={tool.label}
                  aria-keyshortcuts={tool.ariaKeyShortcuts}
                  title={title}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyFormat(tool.action)}
                >
                  <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <textarea
            ref={textareaRef}
            className="markdown-source"
            value={source}
            onChange={(event) => {
              cancelSelectionRestore();
              onChange(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            onSelect={cancelSelectionRestore}
            placeholder={"# 从一个标题开始\n\n写下你的想法…"}
            spellCheck
            aria-label="Markdown 正文"
          />
        </>
      ) : (
        <MarkdownContent source={source} />
      )}
    </section>
  );
}
