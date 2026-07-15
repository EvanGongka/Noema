import { describe, expect, it } from "vitest";
import { markdownDocument, mergeTagIds, noteMatches } from "./note-utils";

const note = {
  title: "跨端 Markdown 方案",
  plainText: "# 目标\n\n统一 Web 和 iOS 的笔记体验。",
  tags: [{ tag: { id: "tag-1", name: "产品设计", color: "#596B5B" } }],
};

describe("精简版笔记工具", () => {
  it("以 Markdown 源码构造兼容文档", () => {
    expect(markdownDocument("# 标题")).toEqual({
      type: "markdown",
      version: 1,
      source: "# 标题",
    });
  });

  it("在标题、正文、标签中按全部关键词匹配", () => {
    expect(noteMatches(note, "Markdown iOS")).toBe(true);
    expect(noteMatches(note, "产品设计")).toBe(true);
    expect(noteMatches(note, "Markdown 不存在")).toBe(false);
    expect(noteMatches(note, "", "tag-1")).toBe(true);
    expect(noteMatches(note, "", "tag-2")).toBe(false);
  });

  it("追加标签时不产生重复项", () => {
    expect(mergeTagIds(["a"], ["a", "b"])).toEqual(["a", "b"]);
  });
});
