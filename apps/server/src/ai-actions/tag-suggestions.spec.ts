import { describe, expect, it } from "vitest";
import { AiActionsService, normalizeSuggestedTags } from "./ai-actions.service";

describe("AI 标签建议", () => {
  it("清理井号、忽略大小写去重并限制为八个", () => {
    expect(
      normalizeSuggestedTags([
        "#TypeScript",
        "typescript",
        " 笔记 ",
        "",
        "一",
        "二",
        "三",
        "四",
        "五",
        "六",
        "七",
      ]),
    ).toEqual(["TypeScript", "笔记", "一", "二", "三", "四", "五", "六"]);
  });

  it("单个标签最多保留四十个字符", () => {
    expect(normalizeSuggestedTags(["标".repeat(50)])[0]).toHaveLength(40);
  });

  it("只允许为当前工作空间中的笔记生成标签", async () => {
    const service = new AiActionsService(
      { note: { findFirst: async () => null } } as never,
      {} as never,
    );
    await expect(
      service.suggestTags(
        {
          userId: "user-1",
          workspaceId: "workspace-1",
          email: "test@example.com",
          isAdmin: false,
        },
        "other-note",
        { credentials: [] },
      ),
    ).rejects.toThrow("笔记不存在");
  });

  it("使用用户模型分析正文且仅返回规范化标签", async () => {
    const service = new AiActionsService(
      {
        note: {
          findFirst: async () => ({ id: "note-1", plainText: "Markdown 笔记" }),
        },
      } as never,
      {
        resolve: async () => ({
          gateway: {
            analyze: async () => ({ tags: ["#Markdown", "markdown", "笔记"] }),
          },
        }),
      } as never,
    );
    await expect(
      service.suggestTags(
        {
          userId: "user-1",
          workspaceId: "workspace-1",
          email: "test@example.com",
          isAdmin: false,
        },
        "note-1",
        { credentials: [] },
      ),
    ).resolves.toEqual({ tags: ["Markdown", "笔记"] });
  });
});
