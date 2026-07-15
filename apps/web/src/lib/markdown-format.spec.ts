import { describe, expect, it } from "vitest";
import {
  applyMarkdownFormat,
  markdownActionForShortcut,
} from "./markdown-format";

describe("Markdown 快捷格式", () => {
  it("在空选区插入占位文本并选中可替换部分", () => {
    expect(applyMarkdownFormat("", 0, 0, "bold")).toEqual({
      source: "**粗体文字**",
      selectionStart: 2,
      selectionEnd: 6,
    });
    expect(applyMarkdownFormat("", 0, 0, "heading2")).toEqual({
      source: "## 标题",
      selectionStart: 3,
      selectionEnd: 5,
    });
  });

  it("包裹选区，并在再次点击时取消相同格式", () => {
    const wrapped = applyMarkdownFormat("一段文字", 2, 4, "bold");
    expect(wrapped).toEqual({
      source: "一段**文字**",
      selectionStart: 4,
      selectionEnd: 6,
    });
    expect(
      applyMarkdownFormat(
        wrapped.source,
        wrapped.selectionStart,
        wrapped.selectionEnd,
        "bold",
      ),
    ).toEqual({
      source: "一段文字",
      selectionStart: 2,
      selectionEnd: 4,
    });
  });

  it("替换标题等级并支持再次取消", () => {
    const replaced = applyMarkdownFormat("## 原标题", 5, 5, "heading1");
    expect(replaced.source).toBe("# 原标题");
    expect(replaced.selectionStart).toBe(4);
    expect(replaced.selectionEnd).toBe(4);
    expect(applyMarkdownFormat(replaced.source, 0, 5, "heading1").source).toBe(
      "原标题",
    );
  });

  it("将多行列表统一转换、重新编号并取消", () => {
    const source = "- 第一项\n> 第二项";
    const ordered = applyMarkdownFormat(
      source,
      0,
      source.length,
      "orderedList",
    );
    expect(ordered.source).toBe("1. 第一项\n2. 第二项");
    expect(
      applyMarkdownFormat(
        ordered.source,
        0,
        ordered.source.length,
        "orderedList",
      ).source,
    ).toBe("第一项\n第二项");
  });

  it("支持任务列表与引用的逐行切换", () => {
    expect(applyMarkdownFormat("事项", 0, 2, "taskList").source).toBe(
      "- [ ] 事项",
    );
    expect(applyMarkdownFormat("- 甲\n- 乙", 0, 7, "quote").source).toBe(
      "> 甲\n> 乙",
    );
  });

  it("代码块可包裹和取消", () => {
    const wrapped = applyMarkdownFormat("const x = 1", 0, 11, "codeBlock");
    expect(wrapped.source).toBe("```\nconst x = 1\n```");
    expect(
      applyMarkdownFormat(
        wrapped.source,
        0,
        wrapped.source.length,
        "codeBlock",
      ),
    ).toEqual({
      source: "const x = 1",
      selectionStart: 0,
      selectionEnd: 11,
    });
  });

  it("代码块支持指定和替换常用语言", () => {
    const typescript = applyMarkdownFormat(
      "const value: number = 1",
      0,
      23,
      "codeBlock",
      { codeLanguage: "typescript" },
    );
    expect(typescript.source).toBe(
      "```typescript\nconst value: number = 1\n```",
    );
    expect(
      applyMarkdownFormat(
        typescript.source,
        0,
        typescript.source.length,
        "codeBlock",
        { codeLanguage: "python" },
      ).source,
    ).toBe("```python\nconst value: number = 1\n```");
  });

  it("插入三列表格并选中第一个表头", () => {
    expect(applyMarkdownFormat("", 0, 0, "table")).toEqual({
      source:
        "| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n| 内容 | 内容 | 内容 |\n\n",
      selectionStart: 2,
      selectionEnd: 5,
    });
  });

  it("按选择的行列数生成表格", () => {
    expect(
      applyMarkdownFormat("", 0, 0, "table", {
        tableRows: 2,
        tableColumns: 4,
      }).source,
    ).toBe(
      "| 列 1 | 列 2 | 列 3 | 列 4 |\n| --- | --- | --- | --- |\n| 内容 | 内容 | 内容 | 内容 |\n\n",
    );
  });

  it("链接在已有选区时选中 URL 占位符", () => {
    expect(applyMarkdownFormat("官网", 0, 2, "link")).toEqual({
      source: "[官网](https://)",
      selectionStart: 5,
      selectionEnd: 13,
    });
  });

  it("分隔线作为独立段落插入且不删除选区", () => {
    expect(applyMarkdownFormat("前文后文", 0, 2, "divider")).toEqual({
      source: "前文\n\n---\n\n后文",
      selectionStart: 9,
      selectionEnd: 9,
    });
  });

  it("只映射编辑器声明的组合键", () => {
    const event = {
      altKey: false,
      ctrlKey: true,
      key: "b",
      metaKey: false,
      shiftKey: false,
    };
    expect(markdownActionForShortcut(event)).toBe("bold");
    expect(
      markdownActionForShortcut({ ...event, altKey: true, key: "2" }),
    ).toBe("heading2");
    expect(markdownActionForShortcut({ ...event, ctrlKey: false })).toBeNull();
  });
});
