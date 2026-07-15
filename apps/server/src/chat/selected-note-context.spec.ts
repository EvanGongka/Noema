import { describe, expect, it } from "vitest";
import { ChatService } from "./chat.service";

describe("选定笔记对话上下文", () => {
  it("直接使用整篇 Markdown，同时保留合法内容块引用", async () => {
    const markdown = "# 标题\n\n这里是需要完整总结的正文。";
    const prisma = {
      note: {
        findFirst: async () => ({
          id: "note-1",
          title: "测试笔记",
          plainText: markdown,
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          blocks: [{ id: "block-1" }],
        }),
      },
    };
    const service = new ChatService(prisma as never, {} as never, {} as never);
    const internal = service as unknown as {
      selectedNoteContext(
        workspaceId: string,
        noteId: string,
      ): Promise<{
        markdown: string;
        hits: Array<{ blockId: string; excerpt: string; reasons: string[] }>;
      }>;
    };

    const context = await internal.selectedNoteContext("workspace-1", "note-1");

    expect(context.markdown).toBe(markdown);
    expect(context.hits[0]).toMatchObject({
      blockId: "block-1",
      excerpt: markdown,
      reasons: ["选定笔记全文"],
    });
  });
});
