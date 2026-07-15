import { Prisma } from "@prisma/client";

interface SavedCitation {
  ordinal: number;
  noteId: string;
  blockId: string;
  excerpt: string;
  note: { title: string };
}

export function buildSavedAnswerText(input: {
  answer: string;
  question?: string | null;
  citations: SavedCitation[];
  includeQuestion: boolean;
  includeCitations: boolean;
}) {
  const parts: string[] = [];
  if (input.includeQuestion && input.question)
    parts.push(`## 原问题\n\n${input.question}`);
  parts.push(`## AI 回答\n\n${input.answer}`);
  if (input.includeCitations && input.citations.length) {
    parts.push(
      `## 引用来源\n\n${input.citations.map((citation) => `- [${citation.ordinal}] **${citation.note.title}**：${citation.excerpt}`).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

export function plainTextToTiptapNodes(text: string): Prisma.JsonArray {
  return text
    .split(/\n{2,}/)
    .map((paragraph, index) =>
      index === 0
        ? {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: paragraph }],
          }
        : {
            type: "paragraph",
            content: paragraph
              .split("\n")
              .flatMap((line, lineIndex) => [
                ...(lineIndex ? [{ type: "hardBreak" }] : []),
                ...(line ? [{ type: "text", text: line }] : []),
              ]),
          },
    ) as Prisma.JsonArray;
}

export function appendTiptapContent(
  current: Prisma.JsonValue,
  nodes: Prisma.JsonArray,
) {
  const document =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Prisma.JsonObject)
      : {};
  const currentNodes = Array.isArray(document.content) ? document.content : [];
  return {
    type: "doc",
    content: [...currentNodes, { type: "horizontalRule" }, ...nodes],
  };
}

export function validCitationOrdinals(answer: string, sourceCount: number) {
  const ordinals = [...answer.matchAll(/\[(\d+)]/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 1 && value <= sourceCount);
  return [...new Set(ordinals)];
}
