import { describe, expect, it } from "vitest";
import {
  appendTiptapContent,
  buildSavedAnswerText,
  plainTextToTiptapNodes,
  validCitationOrdinals,
} from "./chat-content";

describe("AI 回答转笔记", () => {
  it("按用户选择保存问题、回答和引用", () => {
    const text = buildSavedAnswerText({
      answer: "结论 [1]",
      question: "核心结论是什么？",
      includeQuestion: true,
      includeCitations: true,
      citations: [
        {
          ordinal: 1,
          noteId: "note",
          blockId: "block",
          excerpt: "原始证据",
          note: { title: "来源笔记" },
        },
      ],
    });
    expect(text).toContain("## 原问题\n\n核心结论是什么？");
    expect(text).toContain("- [1] **来源笔记**：原始证据");
  });

  it("追加时保留现有文档并插入分隔线", () => {
    const nodes = plainTextToTiptapNodes("AI 回答\n\n新的内容");
    const appended = appendTiptapContent(
      { type: "doc", content: [{ type: "paragraph" }] },
      nodes,
    );
    expect(appended.content).toHaveLength(4);
    expect(appended.content[1]).toEqual({ type: "horizontalRule" });
  });

  it("只接受检索白名单范围内的引用编号", () => {
    expect(validCitationOrdinals("结论 [2]，重复 [2]，伪造 [99]。", 3)).toEqual(
      [2],
    );
  });
});
