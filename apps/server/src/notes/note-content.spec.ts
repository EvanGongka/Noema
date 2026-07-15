import { describe, expect, it } from "vitest";
import {
  extractBlocks,
  markdownDocument,
  markdownSource,
  splitIntoChunks,
} from "./note-content";

describe("笔记内容处理", () => {
  it("从 Tiptap 文档提取稳定的内容块", () => {
    const blocks = extractBlocks(
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "你好" }] },
        ],
      },
      "",
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.plainText).toBe("你好");
  });
  it("切块不丢失长文本", () => {
    const chunks = splitIntoChunks("a".repeat(25), 10);
    expect(chunks.join("")).toBe("a".repeat(25));
  });

  it("使用 Markdown 正文作为唯一来源并按段落切块", () => {
    const document = markdownDocument("# 标题\n\n第一段\n\n第二段");
    expect(markdownSource(document, "旧正文")).toBe(
      "# 标题\n\n第一段\n\n第二段",
    );
    expect(
      extractBlocks(document, "旧正文").map((block) => block.plainText),
    ).toEqual(["# 标题\n第一段\n第二段"]);
  });

  it("旧 Tiptap 笔记继续回退到 plainText", () => {
    expect(markdownSource({ type: "doc", content: [] }, "旧正文")).toBe(
      "旧正文",
    );
  });
});
