import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const output = path.resolve(process.cwd(), "../../output/playwright");
mkdirSync(output, { recursive: true });

interface MockState {
  notes: Array<Record<string, unknown>>;
  tags: Array<Record<string, unknown>>;
  conversations: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installApiMock(page: Page) {
  const now = "2026-07-15T08:00:00.000Z";
  const state: MockState = {
    notes: [
      {
        id: "note-1",
        workspaceId: "workspace-1",
        title: "产品方向",
        plainText: "# 产品方向\n\n保持简单，专注 Markdown 笔记。",
        content: {
          type: "markdown",
          version: 1,
          source: "# 产品方向\n\n保持简单，专注 Markdown 笔记。",
        },
        status: "ACTIVE",
        aiEnabled: true,
        version: 1,
        updatedAt: now,
        tags: [{ tag: { id: "tag-1", name: "产品", color: "#596B5B" } }],
      },
    ],
    tags: [{ id: "tag-1", name: "产品", color: "#596B5B" }],
    conversations: [],
    messages: [],
  };

  await page.route("http://localhost:4000/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.replace("/api/v1", "");
    const method = request.method();

    if (apiPath === "/auth/me") {
      return json(route, {
        userId: "user-1",
        workspaceId: "workspace-1",
        name: "测试用户",
        email: "test@example.com",
        isAdmin: true,
      });
    }
    if (apiPath === "/auth/logout") return json(route, { ok: true });
    if (apiPath === "/notes" && method === "GET")
      return json(route, state.notes);
    if (apiPath === "/notes" && method === "POST") {
      const body = request.postDataJSON();
      const note = {
        id: `note-${state.notes.length + 1}`,
        workspaceId: "workspace-1",
        version: 0,
        updatedAt: now,
        tags: [],
        ...body,
      };
      state.notes.unshift(note);
      return json(route, note, 201);
    }
    if (apiPath.startsWith("/notes/") && method === "GET") {
      return json(
        route,
        state.notes.find((note) => note.id === apiPath.split("/")[2]),
      );
    }
    if (apiPath.startsWith("/notes/") && method === "PATCH") {
      const id = apiPath.split("/")[2];
      const body = request.postDataJSON();
      const index = state.notes.findIndex((note) => note.id === id);
      state.notes[index] = {
        ...state.notes[index],
        ...body,
        version: Number(state.notes[index]?.version ?? 0) + 1,
        updatedAt: now,
      };
      return json(route, state.notes[index]);
    }
    if (apiPath.startsWith("/notes/") && method === "DELETE") {
      state.notes = state.notes.filter(
        (note) => note.id !== apiPath.split("/")[2],
      );
      return route.fulfill({ status: 204, body: "" });
    }
    if (apiPath === "/catalog/tags" && method === "GET")
      return json(route, state.tags);
    if (apiPath === "/catalog/tags" && method === "POST") {
      const tag = {
        id: `tag-${state.tags.length + 1}`,
        ...request.postDataJSON(),
      };
      state.tags.push(tag);
      return json(route, tag, 201);
    }
    if (apiPath === "/transfer/import") {
      const body = request.postDataJSON();
      const note = {
        id: "note-imported",
        title: String(body.filename).replace(/\.md$/i, ""),
        plainText: body.content,
        content: { type: "markdown", version: 1, source: body.content },
        version: 0,
        updatedAt: now,
        tags: [],
      };
      state.notes.unshift(note);
      return json(route, note, 201);
    }
    if (apiPath === "/ai/providers" && method === "GET") {
      return json(route, [
        {
          id: "provider-1",
          provider: "OLLAMA",
          name: "本机 Ollama",
          baseUrl: "http://localhost:11434",
          chatModel: "qwen3:8b",
          enabled: true,
          isDefaultChat: true,
          isDefaultEmbedding: false,
        },
      ]);
    }
    if (apiPath === "/ai/providers" && method === "POST")
      return json(route, { id: "provider-2", ...request.postDataJSON() }, 201);
    if (apiPath === "/ai/providers/provider-1/test")
      return json(route, { latencyMs: 12, modelCount: 3 }, 201);
    if (apiPath === "/ai/providers/provider-1" && method === "PATCH")
      return json(route, { ok: true });
    if (apiPath === "/ai/notes/note-1/tag-suggestions")
      return json(route, { tags: ["Markdown", "精简产品"] }, 201);
    if (apiPath === "/chat/conversations" && method === "GET")
      return json(route, state.conversations);
    if (apiPath === "/chat/conversations" && method === "POST") {
      const body = request.postDataJSON();
      const conversation = {
        id: "conversation-1",
        title: "新对话",
        updatedAt: now,
        _count: { messages: 0 },
        ...body,
      };
      state.conversations = [conversation];
      state.messages = [];
      return json(route, conversation, 201);
    }
    if (apiPath === "/chat/conversations/conversation-1" && method === "GET") {
      return json(route, {
        ...state.conversations[0],
        messages: state.messages,
      });
    }
    if (apiPath === "/chat/conversations/conversation-1/messages/stream") {
      const body = request.postDataJSON();
      const basedOnNote = state.conversations[0]?.mode === "KNOWLEDGE";
      state.messages = [
        {
          id: "question-1",
          role: "USER",
          content: body.content,
          status: "COMPLETED",
          citations: [],
        },
        {
          id: "answer-1",
          role: "ASSISTANT",
          content: basedOnNote
            ? "这篇笔记强调保持简单。[1]"
            : "这是一次自由对话。",
          status: "COMPLETED",
          answerType: basedOnNote ? "GROUNDED" : "GENERAL",
          citations: basedOnNote
            ? [
                {
                  ordinal: 1,
                  noteId: "note-1",
                  blockId: "block-1",
                  excerpt: "保持简单",
                  noteTitle: "产品方向",
                },
              ]
            : [],
        },
      ];
      const answer = state.messages[1]?.content;
      const frames =
        [
          `event: meta\ndata: ${JSON.stringify({ runId: "run-1", messageId: "answer-1" })}`,
          `event: delta\ndata: ${JSON.stringify({ text: answer })}`,
          ...(basedOnNote
            ? [
                `event: citation\ndata: ${JSON.stringify({ citation: state.messages[1]?.citations?.[0] })}`,
              ]
            : []),
          `event: done\ndata: ${JSON.stringify({ messageId: "answer-1", answer, answerType: basedOnNote ? "GROUNDED" : "GENERAL" })}`,
        ].join("\n\n") + "\n\n";
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: frames,
      });
    }
    if (apiPath === "/chat/messages/answer-1/save-to-note") {
      const body = request.postDataJSON();
      if (body.mode === "CREATE") {
        const note = {
          id: "note-ai",
          title: body.title,
          plainText: "## AI 回答\n\n整理后的回答",
          content: {
            type: "markdown",
            version: 1,
            source: "## AI 回答\n\n整理后的回答",
          },
          version: 0,
          updatedAt: now,
          tags: [],
        };
        state.notes.unshift(note);
        return json(route, note, 201);
      }
      return json(
        route,
        state.notes.find((note) => note.id === body.noteId),
        201,
      );
    }
    if (apiPath.startsWith("/chat/conversations/") && method === "DELETE")
      return json(route, { ok: true });

    return json(
      route,
      { code: "UNMOCKED", message: `${method} ${apiPath}` },
      501,
    );
  });
}

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
  await page.goto("/workspace");
  await expect(
    page.getByRole("heading", { name: "笔记", exact: true }),
  ).toBeVisible();
});

test("三栏目、Markdown、搜索和标签流程", async ({ page }, testInfo) => {
  const navigation =
    testInfo.project.name === "mobile"
      ? page.getByRole("navigation", { name: "移动端主导航" })
      : page.getByRole("navigation", { name: "主导航" });
  await expect(navigation.getByRole("button")).toHaveCount(3);
  await expect(navigation).toContainText("笔记");
  await expect(navigation).toContainText("AI 对话");
  await expect(navigation).toContainText("设置");
  await expect(navigation).not.toContainText("收集箱");
  await expect(navigation).not.toContainText("待办");

  if (testInfo.project.name === "mobile")
    await page.getByText("产品方向", { exact: true }).click();
  const editor = page.getByLabel("Markdown 正文");
  await editor.fill("# 新标题\n\nMarkdown 正文已更新。");
  await page.getByRole("tab", { name: "预览" }).click();
  await expect(page.getByRole("heading", { name: "新标题" })).toBeVisible();

  await page.getByRole("tab", { name: "编辑" }).click();
  await page.getByRole("button", { name: "AI 生成标签" }).click();
  await expect(
    page.getByRole("heading", { name: "确认要添加的标签" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认添加" }).click();
  await expect(
    page.locator(".note-tags").getByRole("button", { name: "#Markdown" }),
  ).toBeVisible();

  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "返回" }).click();
  await page.getByPlaceholder("搜索标题、正文或标签").fill("完全不存在");
  await expect(page.getByText("没有匹配的笔记。")).toBeVisible();
  await page.getByPlaceholder("搜索标题、正文或标签").fill("产品 Markdown");
  await expect(page.getByText("产品方向", { exact: true })).toBeVisible();

  await page.screenshot({
    path: path.join(output, `notes-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("Markdown 快捷格式工具栏和键盘快捷键", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile")
    await page.getByText("产品方向", { exact: true }).click();

  const toolbar = page.getByRole("toolbar", { name: "Markdown 快捷格式" });
  const editor = page.getByLabel("Markdown 正文");
  const replaceEditor = async (value: string) => {
    await editor.focus();
    await editor.press("ControlOrMeta+A");
    await page.keyboard.insertText(value);
    await expect(editor).toHaveValue(value);
  };
  await expect(toolbar.getByRole("button")).toHaveCount(16);

  const cases = [
    ["一级标题", "# 标题"],
    ["二级标题", "## 标题"],
    ["三级标题", "### 标题"],
    ["粗体", "**粗体文字**"],
    ["斜体", "_斜体文字_"],
    ["删除线", "~~删除线文字~~"],
    ["行内代码", "`代码`"],
    ["链接", "[链接文字](https://)"],
    ["无序列表", "- 列表项"],
    ["有序列表", "1. 列表项"],
    ["任务列表", "- [ ] 待办项"],
    ["引用", "> 引用内容"],
    ["代码块", "```\n代码\n```"],
    ["分隔线", "---\n\n"],
  ] as const;

  for (const [label, expected] of cases) {
    await editor.focus();
    await editor.press("ControlOrMeta+A");
    await editor.press("Backspace");
    await expect(editor).toHaveValue("");
    await toolbar.getByRole("button", { name: label, exact: true }).click();
    await expect(editor).toHaveValue(expected);
  }

  await editor.focus();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await toolbar.getByRole("button", { name: "表格", exact: true }).click();
  const tablePicker = page.getByRole("dialog", { name: "选择表格大小" });
  await expect(tablePicker).toContainText("3 行 × 3 列");
  await page.screenshot({
    path: path.join(output, `table-picker-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await tablePicker
    .getByRole("gridcell", { name: "4 行 × 5 列", exact: true })
    .click();
  await expect(editor).toHaveValue(
    "| 列 1 | 列 2 | 列 3 | 列 4 | 列 5 |\n| --- | --- | --- | --- | --- |\n| 内容 | 内容 | 内容 | 内容 | 内容 |\n| 内容 | 内容 | 内容 | 内容 | 内容 |\n| 内容 | 内容 | 内容 | 内容 | 内容 |\n\n",
  );
  await page.getByRole("tab", { name: "预览" }).click();
  await expect(page.locator(".markdown-content table tr")).toHaveCount(4);
  await expect(page.locator(".markdown-content table th")).toHaveCount(5);
  await page.getByRole("tab", { name: "编辑" }).click();

  await replaceEditor("const value: number = 1");
  await editor.selectText();
  await toolbar
    .getByRole("button", { name: "选择代码语言", exact: true })
    .click();
  await page.screenshot({
    path: path.join(output, `code-language-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page
    .getByRole("menu", { name: "常用代码语言" })
    .getByRole("menuitem", { name: /TypeScript/ })
    .click();
  await expect(editor).toHaveValue(
    "```typescript\nconst value: number = 1\n```",
  );
  await page.getByRole("tab", { name: "预览" }).click();
  await expect(
    page.locator(".markdown-content code.language-typescript"),
  ).toContainText("const value: number = 1");
  await page.getByRole("tab", { name: "编辑" }).click();

  await replaceEditor("智能切换");
  await editor.selectText();
  await toolbar.getByRole("button", { name: "粗体", exact: true }).click();
  await expect(editor).toHaveValue("**智能切换**");
  await toolbar.getByRole("button", { name: "粗体", exact: true }).click();
  await expect(editor).toHaveValue("智能切换");

  await replaceEditor("键盘快捷键");
  await editor.selectText();
  await editor.press("Control+b");
  await expect(editor).toHaveValue("**键盘快捷键**");
  await expect(page.getByText("已保存")).toBeVisible();

  const buttonPositions = await toolbar
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { top: Math.round(rect.top), right: rect.right };
      }),
    );
  const toolbarRows = new Set(buttonPositions.map((position) => position.top));
  expect(toolbarRows.size).toBe(testInfo.project.name === "mobile" ? 2 : 1);
  expect(
    Math.max(...buttonPositions.map((position) => position.right)),
  ).toBeLessThanOrEqual(page.viewportSize()?.width ?? Number.MAX_SAFE_INTEGER);

  await page.screenshot({
    path: path.join(output, `markdown-toolbar-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.getByRole("tab", { name: "预览" }).click();
  await expect(toolbar).toBeHidden();
  await expect(page.locator(".markdown-content strong")).toHaveText(
    "键盘快捷键",
  );
});

test("选定笔记对话并把回答新建为笔记", async ({ page }, testInfo) => {
  const navigation =
    testInfo.project.name === "mobile"
      ? page.getByRole("navigation", { name: "移动端主导航" })
      : page.getByRole("navigation", { name: "主导航" });
  await navigation.getByRole("button", { name: "AI 对话" }).click();
  await page.getByRole("button", { name: "基于笔记" }).click();
  await page.getByRole("combobox").first().selectOption("note-1");
  await page.getByRole("button", { name: "总结全文" }).click();
  await expect(page.getByText("这篇笔记强调保持简单。[1]")).toBeVisible();
  await page.screenshot({
    path: path.join(output, `ai-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole("button", { name: "记入笔记" }).click();
  await page.getByLabel("笔记标题").fill("AI 总结");
  await page.getByRole("button", { name: "确认写入" }).click();
  await expect(page.locator(".note-title")).toHaveValue("AI 总结");
});

test("设置仅提供 BYOK 模型和账户", async ({ page }, testInfo) => {
  const navigation =
    testInfo.project.name === "mobile"
      ? page.getByRole("navigation", { name: "移动端主导航" })
      : page.getByRole("navigation", { name: "主导航" });
  await navigation.getByRole("button", { name: "设置" }).click();
  await expect(page.getByRole("heading", { name: "模型配置" })).toBeVisible();
  await expect(
    page.getByRole("option", { name: "OpenAI / 兼容接口" }),
  ).toBeAttached();
  await expect(
    page.getByRole("option", { name: "Anthropic Claude" }),
  ).toBeAttached();
  await expect(
    page.getByRole("option", { name: "Google Gemini" }),
  ).toBeAttached();
  await expect(page.getByRole("option", { name: "Ollama" })).toBeAttached();
  await expect(
    page.locator(".account-card").getByText("测试用户"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
  await expect(page.getByText("嵌入模型")).toHaveCount(0);
  await expect(page.getByText("Mock")).toHaveCount(0);
  await page.screenshot({
    path: path.join(output, `settings-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
