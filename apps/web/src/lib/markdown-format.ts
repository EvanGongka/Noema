export type MarkdownFormatAction =
  | "heading1"
  | "heading2"
  | "heading3"
  | "bold"
  | "italic"
  | "strikethrough"
  | "inlineCode"
  | "link"
  | "unorderedList"
  | "orderedList"
  | "taskList"
  | "quote"
  | "codeBlock"
  | "table"
  | "divider";

export type MarkdownFormatResult = {
  source: string;
  selectionStart: number;
  selectionEnd: number;
};

export type MarkdownFormatOptions = {
  codeLanguage?: string;
  tableColumns?: number;
  tableRows?: number;
};

type ShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

type LineAction = Extract<
  MarkdownFormatAction,
  | "heading1"
  | "heading2"
  | "heading3"
  | "unorderedList"
  | "orderedList"
  | "taskList"
  | "quote"
>;

const linePlaceholders: Record<LineAction, string> = {
  heading1: "标题",
  heading2: "标题",
  heading3: "标题",
  unorderedList: "列表项",
  orderedList: "列表项",
  taskList: "待办项",
  quote: "引用内容",
};

function normalizeSelection(
  source: string,
  selectionStart: number,
  selectionEnd: number,
) {
  const start = Math.max(0, Math.min(source.length, selectionStart));
  const end = Math.max(0, Math.min(source.length, selectionEnd));
  return start <= end ? { start, end } : { start: end, end: start };
}

function replaceRange(
  source: string,
  start: number,
  end: number,
  replacement: string,
  relativeSelectionStart: number,
  relativeSelectionEnd: number,
): MarkdownFormatResult {
  return {
    source: `${source.slice(0, start)}${replacement}${source.slice(end)}`,
    selectionStart: start + relativeSelectionStart,
    selectionEnd: start + relativeSelectionEnd,
  };
}

function toggleWrapper(
  source: string,
  start: number,
  end: number,
  open: string,
  close: string,
  placeholder: string,
): MarkdownFormatResult {
  if (start === end) {
    const replacement = `${open}${placeholder}${close}`;
    return replaceRange(
      source,
      start,
      end,
      replacement,
      open.length,
      open.length + placeholder.length,
    );
  }

  const selected = source.slice(start, end);
  if (
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    selected.length >= open.length + close.length
  ) {
    const inner = selected.slice(open.length, selected.length - close.length);
    return replaceRange(source, start, end, inner, 0, inner.length);
  }

  const outerStart = start - open.length;
  const outerEnd = end + close.length;
  if (
    outerStart >= 0 &&
    source.slice(outerStart, start) === open &&
    source.slice(end, outerEnd) === close
  ) {
    const replacement = selected;
    return replaceRange(
      source,
      outerStart,
      outerEnd,
      replacement,
      0,
      replacement.length,
    );
  }

  const replacement = `${open}${selected}${close}`;
  return replaceRange(
    source,
    start,
    end,
    replacement,
    open.length,
    open.length + selected.length,
  );
}

function lineRange(source: string, start: number, end: number) {
  const startSearchIndex = Math.max(-1, start - 1);
  const rangeStart = source.lastIndexOf("\n", startSearchIndex) + 1;
  const effectiveEnd = end > start && source[end - 1] === "\n" ? end - 1 : end;
  const nextLineBreak = source.indexOf("\n", effectiveEnd);
  const rangeEnd = nextLineBreak === -1 ? source.length : nextLineBreak;
  return { rangeStart, rangeEnd };
}

function targetPrefix(action: LineAction, index: number) {
  switch (action) {
    case "heading1":
      return "# ";
    case "heading2":
      return "## ";
    case "heading3":
      return "### ";
    case "unorderedList":
      return "- ";
    case "orderedList":
      return `${index}. `;
    case "taskList":
      return "- [ ] ";
    case "quote":
      return "> ";
  }
}

function targetPrefixMatch(line: string, action: LineAction) {
  switch (action) {
    case "heading1":
      return line.match(/^#\s+/)?.[0] ?? null;
    case "heading2":
      return line.match(/^##\s+/)?.[0] ?? null;
    case "heading3":
      return line.match(/^###\s+/)?.[0] ?? null;
    case "unorderedList":
      return line.match(/^[-*+]\s+(?!\[[ xX]\]\s+)/)?.[0] ?? null;
    case "orderedList":
      return line.match(/^\d+\.\s+/)?.[0] ?? null;
    case "taskList":
      return line.match(/^[-*+]\s+\[[ xX]\]\s+/)?.[0] ?? null;
    case "quote":
      return line.match(/^>\s?/)?.[0] ?? null;
  }
}

function stripConvertiblePrefix(line: string, action: LineAction) {
  if (action.startsWith("heading")) {
    return line.replace(/^#{1,6}\s+/, "");
  }

  return line.replace(/^(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+|>\s?)/, "");
}

function applyLineAction(
  source: string,
  start: number,
  end: number,
  action: LineAction,
): MarkdownFormatResult {
  const { rangeStart, rangeEnd } = lineRange(source, start, end);
  const block = source.slice(rangeStart, rangeEnd);

  if (start === end && block.length === 0) {
    const prefix = targetPrefix(action, 1);
    const placeholder = linePlaceholders[action];
    return replaceRange(
      source,
      rangeStart,
      rangeEnd,
      `${prefix}${placeholder}`,
      prefix.length,
      prefix.length + placeholder.length,
    );
  }

  const lines = block.split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const removeFormat =
    nonEmptyLines.length > 0 &&
    nonEmptyLines.every((line) => targetPrefixMatch(line, action) !== null);
  let orderedIndex = 0;
  const transformedLines = lines.map((line) => {
    if (!line.trim()) return line;
    const currentTargetPrefix = targetPrefixMatch(line, action);
    if (removeFormat && currentTargetPrefix) {
      return line.slice(currentTargetPrefix.length);
    }

    const content = stripConvertiblePrefix(line, action);
    if (action === "orderedList") orderedIndex += 1;
    return `${targetPrefix(action, orderedIndex || 1)}${content}`;
  });
  const replacement = transformedLines.join("\n");

  if (start !== end) {
    return replaceRange(
      source,
      rangeStart,
      rangeEnd,
      replacement,
      0,
      replacement.length,
    );
  }

  const oldLine = lines[0] ?? "";
  const newLine = transformedLines[0] ?? "";
  const oldContent = removeFormat
    ? oldLine.slice(targetPrefixMatch(oldLine, action)?.length ?? 0)
    : stripConvertiblePrefix(oldLine, action);
  const oldPrefixLength = oldLine.length - oldContent.length;
  const newPrefixLength = newLine.length - oldContent.length;
  const oldColumn = start - rangeStart;
  const contentColumn = Math.max(
    0,
    Math.min(oldContent.length, oldColumn - oldPrefixLength),
  );
  const newCursor = Math.max(0, newPrefixLength) + contentColumn;

  return replaceRange(
    source,
    rangeStart,
    rangeEnd,
    replacement,
    newCursor,
    newCursor,
  );
}

function applyLink(
  source: string,
  start: number,
  end: number,
): MarkdownFormatResult {
  if (start === end) {
    const label = "链接文字";
    const replacement = `[${label}](https://)`;
    return replaceRange(source, start, end, replacement, 1, 1 + label.length);
  }

  const selected = source.slice(start, end);
  const existingLink = selected.match(/^\[([^\]]+)\]\(([^)]*)\)$/);
  if (existingLink) {
    const label = existingLink[1] ?? "";
    return replaceRange(source, start, end, label, 0, label.length);
  }

  const url = "https://";
  const replacement = `[${selected}](${url})`;
  const urlStart = selected.length + 3;
  return replaceRange(
    source,
    start,
    end,
    replacement,
    urlStart,
    urlStart + url.length,
  );
}

function applyCodeBlock(
  source: string,
  start: number,
  end: number,
  codeLanguage?: string,
): MarkdownFormatResult {
  const language =
    codeLanguage === undefined
      ? ""
      : codeLanguage.trim().replace(/[^a-zA-Z0-9_+#.-]/g, "");
  const open = `\`\`\`${language}\n`;

  if (start === end) {
    const placeholder = "代码";
    const replacement = `${open}${placeholder}\n\`\`\``;
    return replaceRange(
      source,
      start,
      end,
      replacement,
      open.length,
      open.length + placeholder.length,
    );
  }

  const selected = source.slice(start, end);
  const exactFence = selected.match(/^```([^\n]*)\n([\s\S]*?)\n```$/);
  if (exactFence) {
    const inner = exactFence[2] ?? "";
    if (codeLanguage !== undefined) {
      const replacement = `${open}${inner}\n\`\`\``;
      return replaceRange(
        source,
        start,
        end,
        replacement,
        open.length,
        open.length + inner.length,
      );
    }
    return replaceRange(source, start, end, inner, 0, inner.length);
  }

  const openingFence = source.slice(0, start).match(/```[^\n]*\n$/)?.[0];
  const closingFence = source.slice(end).match(/^\n```/)?.[0];
  if (openingFence && closingFence) {
    const outerStart = start - openingFence.length;
    const outerEnd = end + closingFence.length;
    if (codeLanguage !== undefined) {
      const replacement = `${open}${selected}\n\`\`\``;
      return replaceRange(
        source,
        outerStart,
        outerEnd,
        replacement,
        open.length,
        open.length + selected.length,
      );
    }
    return replaceRange(
      source,
      outerStart,
      outerEnd,
      selected,
      0,
      selected.length,
    );
  }

  const replacement = `${open}${selected}\n\`\`\``;
  return replaceRange(
    source,
    start,
    end,
    replacement,
    open.length,
    open.length + selected.length,
  );
}

function applyTable(
  source: string,
  position: number,
  requestedRows = 3,
  requestedColumns = 3,
): MarkdownFormatResult {
  const rows = Math.max(1, Math.min(8, Math.round(requestedRows) || 3));
  const columns = Math.max(1, Math.min(8, Math.round(requestedColumns) || 3));
  const tableRows = [
    `| ${Array.from({ length: columns }, (_, index) => `列 ${index + 1}`).join(" | ")} |`,
    `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`,
    ...Array.from(
      { length: rows - 1 },
      () => `| ${Array.from({ length: columns }, () => "内容").join(" | ")} |`,
    ),
  ];
  const table = tableRows.join("\n");
  const before = source.slice(0, position);
  const after = source.slice(position);
  const leading =
    before.length === 0
      ? ""
      : before.endsWith("\n\n")
        ? ""
        : before.endsWith("\n")
          ? "\n"
          : "\n\n";
  const trailing =
    after.length === 0
      ? "\n\n"
      : after.startsWith("\n\n")
        ? ""
        : after.startsWith("\n")
          ? "\n"
          : "\n\n";
  const insertion = `${leading}${table}${trailing}`;
  const headerStart = leading.length + 2;

  return replaceRange(
    source,
    position,
    position,
    insertion,
    headerStart,
    headerStart + "列 1".length,
  );
}

function applyDivider(source: string, position: number): MarkdownFormatResult {
  const before = source.slice(0, position);
  const after = source.slice(position);
  const leading =
    before.length === 0
      ? ""
      : before.endsWith("\n\n")
        ? ""
        : before.endsWith("\n")
          ? "\n"
          : "\n\n";
  const trailing =
    after.length === 0
      ? "\n\n"
      : after.startsWith("\n\n")
        ? ""
        : after.startsWith("\n")
          ? "\n"
          : "\n\n";
  const insertion = `${leading}---${trailing}`;

  return replaceRange(
    source,
    position,
    position,
    insertion,
    insertion.length,
    insertion.length,
  );
}

export function applyMarkdownFormat(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  action: MarkdownFormatAction,
  options: MarkdownFormatOptions = {},
): MarkdownFormatResult {
  const { start, end } = normalizeSelection(
    source,
    selectionStart,
    selectionEnd,
  );

  switch (action) {
    case "bold":
      return toggleWrapper(source, start, end, "**", "**", "粗体文字");
    case "italic":
      return toggleWrapper(source, start, end, "_", "_", "斜体文字");
    case "strikethrough":
      return toggleWrapper(source, start, end, "~~", "~~", "删除线文字");
    case "inlineCode":
      return toggleWrapper(source, start, end, "`", "`", "代码");
    case "link":
      return applyLink(source, start, end);
    case "codeBlock":
      return applyCodeBlock(source, start, end, options.codeLanguage);
    case "table":
      return applyTable(source, end, options.tableRows, options.tableColumns);
    case "divider":
      return applyDivider(source, end);
    default:
      return applyLineAction(source, start, end, action);
  }
}

export function markdownActionForShortcut(
  event: ShortcutEvent,
): MarkdownFormatAction | null {
  if (!event.metaKey && !event.ctrlKey) return null;
  const key = event.key.toLowerCase();

  if (event.altKey && !event.shiftKey) {
    if (key === "1") return "heading1";
    if (key === "2") return "heading2";
    if (key === "3") return "heading3";
    return null;
  }

  if (event.altKey) return null;
  if (event.shiftKey) return key === "x" ? "strikethrough" : null;
  if (key === "b") return "bold";
  if (key === "i") return "italic";
  if (key === "k") return "link";
  if (key === "e") return "inlineCode";
  return null;
}
