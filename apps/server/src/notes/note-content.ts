export interface BlockInput {
  type: string;
  content: unknown;
  plainText: string;
}

export interface MarkdownDocument {
  [key: string]: string | number;
  type: "markdown";
  version: 1;
  source: string;
}

export function markdownDocument(source: string): MarkdownDocument {
  return { type: "markdown", version: 1, source };
}

export function markdownSource(content: unknown, fallbackText: string): string {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const record = content as Record<string, unknown>;
    if (record.type === "markdown" && typeof record.source === "string")
      return record.source;
  }
  return fallbackText;
}

export function extractBlocks(
  content: unknown,
  fallbackText: string,
): BlockInput[] {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const record = content as Record<string, unknown>;
    if (record.type === "markdown" && typeof record.source === "string") {
      const chunks = splitIntoChunks(record.source);
      return (chunks.length ? chunks : [""]).map((plainText) => ({
        type: "markdown",
        content: { type: "markdown", text: plainText },
        plainText,
      }));
    }
  }
  if (
    !content ||
    typeof content !== "object" ||
    !("content" in content) ||
    !Array.isArray(content.content)
  ) {
    return [
      {
        type: "paragraph",
        content: { type: "paragraph", text: fallbackText },
        plainText: fallbackText,
      },
    ];
  }
  const textFromNode = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (Array.isArray(record.content))
      return record.content.map(textFromNode).join("");
    return "";
  };
  return content.content.map((node: unknown) => {
    const record =
      node && typeof node === "object" ? (node as Record<string, unknown>) : {};
    return {
      type: typeof record.type === "string" ? record.type : "paragraph",
      content: node,
      plainText: textFromNode(node),
    };
  });
}

export function splitIntoChunks(text: string, maxLength = 800): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > maxLength) {
      chunks.push(current);
      current = "";
    }
    if (paragraph.length > maxLength) {
      if (current) chunks.push(current);
      for (let offset = 0; offset < paragraph.length; offset += maxLength)
        chunks.push(paragraph.slice(offset, offset + maxLength));
    } else {
      current = current ? `${current}\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
