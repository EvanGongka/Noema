import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  aiActionApplySchema,
  aiActionSchema,
  askSchema,
  askWithCredentialsSchema,
  chatMessageSchema,
  conversationCreateSchema,
  conversationPatchSchema,
  credentialBundleSchema,
  deleteAccountSchema,
  fileConfirmSchema,
  fileSchema,
  folderSchema,
  importSchema,
  mobileLoginSchema,
  mobileRefreshSchema,
  mobileRegisterSchema,
  notePatchSchema,
  noteSchema,
  providerConfigPatchSchema,
  providerConfigSchema,
  providerCredentialSchema,
  saveMessageToNoteSchema,
  searchSchema,
  searchRequestSchema,
  tagSchema,
  tagSuggestionSchema,
  taskPatchSchema,
  taskSchema,
} from "./contracts";

type JsonObject = Record<string, unknown>;
const convertSchema = zodToJsonSchema as unknown as (
  schema: z.ZodTypeAny,
  options: { target: "openApi3"; $refStrategy: "none" },
) => JsonObject;

function fromZod(schema: z.ZodTypeAny): JsonObject {
  const converted = convertSchema(schema, {
    target: "openApi3",
    $refStrategy: "none",
  });
  delete converted.$schema;
  return toOpenApi31(converted) as JsonObject;
}

function toOpenApi31(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toOpenApi31);
  if (!value || typeof value !== "object") return value;
  const normalized = Object.fromEntries(
    Object.entries(value as JsonObject).map(([key, item]) => [
      key,
      toOpenApi31(item),
    ]),
  );
  if (normalized.nullable === true && typeof normalized.type === "string") {
    normalized.type = [normalized.type, "null"];
    delete normalized.nullable;
  }
  if (
    normalized.exclusiveMinimum === true &&
    typeof normalized.minimum === "number"
  ) {
    normalized.exclusiveMinimum = normalized.minimum;
    delete normalized.minimum;
  } else if (normalized.exclusiveMinimum === false)
    delete normalized.exclusiveMinimum;
  if (
    normalized.exclusiveMaximum === true &&
    typeof normalized.maximum === "number"
  ) {
    normalized.exclusiveMaximum = normalized.maximum;
    delete normalized.maximum;
  } else if (normalized.exclusiveMaximum === false)
    delete normalized.exclusiveMaximum;
  return normalized;
}

const ref = (name: string): JsonObject => ({
  $ref: `#/components/schemas/${name}`,
});
const arrayOf = (item: JsonObject): JsonObject => ({
  type: "array",
  items: item,
});
const nullableString: JsonObject = { type: ["string", "null"] };
const dateTime: JsonObject = { type: "string", format: "date-time" };
const nullableDateTime: JsonObject = {
  type: ["string", "null"],
  format: "date-time",
};
const jsonValue: JsonObject = {
  description: "保留未知 Tiptap 节点和属性的任意 JSON 值",
};

const user = {
  type: "object",
  required: ["userId", "workspaceId", "email", "name", "isAdmin"],
  properties: {
    userId: { type: "string" },
    workspaceId: { type: "string" },
    email: { type: "string", format: "email" },
    name: { type: "string" },
    isAdmin: { type: "boolean" },
  },
};
const mobileSession = {
  type: "object",
  required: [
    "accessToken",
    "refreshToken",
    "accessTokenExpiresAt",
    "refreshTokenExpiresAt",
    "user",
  ],
  properties: {
    accessToken: { type: "string" },
    refreshToken: { type: "string" },
    accessTokenExpiresAt: dateTime,
    refreshTokenExpiresAt: dateTime,
    user: ref("User"),
  },
};
const noteSummary = {
  type: "object",
  required: [
    "id",
    "workspaceId",
    "title",
    "content",
    "plainText",
    "status",
    "aiEnabled",
    "version",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    id: { type: "string" },
    workspaceId: { type: "string" },
    title: { type: "string" },
    content: ref("JSONValue"),
    plainText: { type: "string" },
    folderId: nullableString,
    status: { type: "string", enum: ["INBOX", "ACTIVE", "ARCHIVED"] },
    aiEnabled: { type: "boolean" },
    version: { type: "integer" },
    summary: nullableString,
    createdAt: dateTime,
    updatedAt: dateTime,
  },
  additionalProperties: true,
};
const folder = {
  type: "object",
  required: ["id", "workspaceId", "name", "createdAt"],
  properties: {
    id: { type: "string" },
    workspaceId: { type: "string" },
    name: { type: "string" },
    parentId: nullableString,
    createdAt: dateTime,
  },
};
const tag = {
  type: "object",
  required: ["id", "workspaceId", "name", "color", "createdAt"],
  properties: {
    id: { type: "string" },
    workspaceId: { type: "string" },
    name: { type: "string" },
    color: { type: "string" },
    createdAt: dateTime,
  },
};
const task = {
  type: "object",
  required: [
    "id",
    "workspaceId",
    "sourceNoteId",
    "title",
    "status",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    id: { type: "string" },
    workspaceId: { type: "string" },
    sourceNoteId: { type: "string" },
    sourceBlockId: nullableString,
    title: { type: "string" },
    status: { type: "string", enum: ["TODO", "DOING", "DONE"] },
    dueAt: nullableDateTime,
    createdAt: dateTime,
    updatedAt: dateTime,
  },
  additionalProperties: true,
};
const providerConfig = {
  type: "object",
  required: [
    "id",
    "provider",
    "name",
    "baseUrl",
    "chatModel",
    "enabled",
    "isDefaultChat",
    "isDefaultEmbedding",
  ],
  properties: {
    id: { type: "string" },
    provider: {
      type: "string",
      enum: ["OPENAI_COMPATIBLE", "ANTHROPIC", "GEMINI", "OLLAMA"],
    },
    name: { type: "string" },
    baseUrl: { type: "string", format: "uri" },
    chatModel: { type: "string" },
    embeddingModel: nullableString,
    enabled: { type: "boolean" },
    isDefaultChat: { type: "boolean" },
    isDefaultEmbedding: { type: "boolean" },
    capabilities: ref("JSONValue"),
    lastValidatedAt: nullableDateTime,
    createdAt: dateTime,
    updatedAt: dateTime,
  },
  additionalProperties: true,
};

const jsonContent = (schema: JsonObject): JsonObject => ({
  "application/json": { schema },
});
const response = (schema?: JsonObject, description = "成功"): JsonObject =>
  schema ? { description, content: jsonContent(schema) } : { description };
const body = (schemaName: string): JsonObject => ({
  required: true,
  content: jsonContent(ref(schemaName)),
});
const bearerSecurity = [{ bearerAuth: [] }, { cookieAuth: [] }];
const idParameter = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
};
const idempotencyParameter = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  description: "8 到 128 位客户端稳定重试键",
  schema: {
    type: "string",
    minLength: 8,
    maxLength: 128,
    pattern: "^[A-Za-z0-9._:-]+$",
  },
};

const components: Record<string, JsonObject> = {
  MobileRegisterInput: fromZod(mobileRegisterSchema),
  MobileLoginInput: fromZod(mobileLoginSchema),
  MobileRefreshInput: fromZod(mobileRefreshSchema),
  DeleteAccountInput: fromZod(deleteAccountSchema),
  NoteInput: fromZod(noteSchema),
  NotePatchInput: fromZod(notePatchSchema),
  SearchInput: fromZod(searchSchema),
  FolderInput: fromZod(folderSchema),
  TagInput: fromZod(tagSchema),
  TaskInput: fromZod(taskSchema),
  TaskPatchInput: fromZod(taskPatchSchema),
  FileInput: fromZod(fileSchema),
  FileConfirmInput: fromZod(fileConfirmSchema),
  ImportInput: fromZod(importSchema),
  ProviderConfigInput: fromZod(providerConfigSchema),
  ProviderConfigPatchInput: fromZod(providerConfigPatchSchema),
  ProviderCredentialInput: fromZod(providerCredentialSchema),
  CredentialBundleInput: fromZod(credentialBundleSchema),
  TagSuggestionInput: fromZod(tagSuggestionSchema),
  AskInput: fromZod(askSchema),
  AskWithCredentialsInput: fromZod(askWithCredentialsSchema),
  SearchRequestInput: fromZod(searchRequestSchema),
  ConversationCreateInput: fromZod(conversationCreateSchema),
  ConversationPatchInput: fromZod(conversationPatchSchema),
  ChatMessageInput: fromZod(chatMessageSchema),
  SaveMessageToNoteInput: fromZod(saveMessageToNoteSchema),
  AiActionInput: fromZod(aiActionSchema),
  AiActionApplyInput: fromZod(aiActionApplySchema),
  JSONValue: jsonValue,
  User: user,
  MobileSession: mobileSession,
  Note: noteSummary,
  Folder: folder,
  Tag: tag,
  Task: task,
  ProviderConfig: providerConfig,
  SearchHit: {
    type: "object",
    required: [
      "noteId",
      "blockId",
      "noteTitle",
      "excerpt",
      "updatedAt",
      "score",
      "reasons",
    ],
    properties: {
      noteId: { type: "string" },
      blockId: { type: "string" },
      noteTitle: { type: "string" },
      excerpt: { type: "string" },
      updatedAt: dateTime,
      score: { type: "number", format: "double" },
      reasons: { type: "array", items: { type: "string" } },
    },
  },
  Conversation: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" } },
    additionalProperties: true,
  },
  Asset: {
    type: "object",
    required: ["id", "key", "filename", "mimeType", "size"],
    properties: {
      id: { type: "string" },
      key: { type: "string" },
      filename: { type: "string" },
      mimeType: { type: "string" },
      size: { type: "integer" },
      noteId: nullableString,
    },
    additionalProperties: true,
  },
  Error: {
    type: "object",
    required: ["statusCode", "message"],
    properties: {
      statusCode: { type: "integer" },
      message: { type: "string" },
      code: { type: "string" },
      details: ref("JSONValue"),
    },
  },
};

const commonErrors = {
  "400": response(ref("Error"), "请求无效"),
  "401": response(ref("Error"), "未认证"),
  "404": response(ref("Error"), "资源不存在"),
  "409": response(ref("Error"), "版本或幂等冲突"),
};

export function createOpenApiDocument(): JsonObject {
  return {
    openapi: "3.1.0",
    info: {
      title: "知流 API",
      version: "1.0.0",
      description: "知流 Web 与 iOS 共用的普通用户 API 契约",
    },
    servers: [{ url: "/api/v1" }],
    tags: [
      "auth",
      "notes",
      "catalog",
      "search",
      "tasks",
      "files",
      "transfer",
      "ai-providers",
      "chat",
      "ai-actions",
    ].map((name) => ({ name })),
    paths: {
      "/auth/mobile/register": {
        post: {
          operationId: "mobileRegister",
          tags: ["auth"],
          requestBody: body("MobileRegisterInput"),
          responses: { "201": response(ref("MobileSession")), ...commonErrors },
        },
      },
      "/auth/mobile/login": {
        post: {
          operationId: "mobileLogin",
          tags: ["auth"],
          requestBody: body("MobileLoginInput"),
          responses: { "200": response(ref("MobileSession")), ...commonErrors },
        },
      },
      "/auth/mobile/refresh": {
        post: {
          operationId: "mobileRefresh",
          tags: ["auth"],
          requestBody: body("MobileRefreshInput"),
          responses: { "200": response(ref("MobileSession")), ...commonErrors },
        },
      },
      "/auth/mobile/logout": {
        post: {
          operationId: "mobileLogout",
          tags: ["auth"],
          security: bearerSecurity,
          responses: { "204": response(), ...commonErrors },
        },
      },
      "/auth/account": {
        delete: {
          operationId: "deleteAccount",
          tags: ["auth"],
          security: bearerSecurity,
          requestBody: body("DeleteAccountInput"),
          responses: { "204": response(), ...commonErrors },
        },
      },
      "/auth/me": {
        get: {
          operationId: "getCurrentUser",
          tags: ["auth"],
          security: bearerSecurity,
          responses: { "200": response(ref("User")), ...commonErrors },
        },
      },
      "/notes": {
        get: {
          operationId: "listNotes",
          tags: ["notes"],
          security: bearerSecurity,
          parameters: [
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["INBOX", "ACTIVE", "ARCHIVED"] },
            },
          ],
          responses: { "200": response(arrayOf(ref("Note"))), ...commonErrors },
        },
        post: {
          operationId: "createNote",
          tags: ["notes"],
          security: bearerSecurity,
          parameters: [idempotencyParameter],
          requestBody: body("NoteInput"),
          responses: { "201": response(ref("Note")), ...commonErrors },
        },
      },
      "/notes/{id}": {
        get: {
          operationId: "getNote",
          tags: ["notes"],
          security: bearerSecurity,
          parameters: [idParameter],
          responses: { "200": response(ref("Note")), ...commonErrors },
        },
        patch: {
          operationId: "updateNote",
          tags: ["notes"],
          security: bearerSecurity,
          parameters: [idParameter, idempotencyParameter],
          requestBody: body("NotePatchInput"),
          responses: { "200": response(ref("Note")), ...commonErrors },
        },
        delete: {
          operationId: "deleteNote",
          tags: ["notes"],
          security: bearerSecurity,
          parameters: [idParameter, idempotencyParameter],
          responses: { "204": response(), ...commonErrors },
        },
      },
      "/notes/{id}/related": {
        get: {
          operationId: "listRelatedNotes",
          tags: ["notes"],
          security: bearerSecurity,
          parameters: [idParameter],
          responses: {
            "200": response(
              arrayOf({ type: "object", additionalProperties: true }),
            ),
            ...commonErrors,
          },
        },
      },
      "/catalog/folders": {
        get: {
          operationId: "listFolders",
          tags: ["catalog"],
          security: bearerSecurity,
          responses: {
            "200": response(arrayOf(ref("Folder"))),
            ...commonErrors,
          },
        },
        post: {
          operationId: "createFolder",
          tags: ["catalog"],
          security: bearerSecurity,
          parameters: [idempotencyParameter],
          requestBody: body("FolderInput"),
          responses: { "201": response(ref("Folder")), ...commonErrors },
        },
      },
      "/catalog/tags": {
        get: {
          operationId: "listTags",
          tags: ["catalog"],
          security: bearerSecurity,
          responses: { "200": response(arrayOf(ref("Tag"))), ...commonErrors },
        },
        post: {
          operationId: "createTag",
          tags: ["catalog"],
          security: bearerSecurity,
          parameters: [idempotencyParameter],
          requestBody: body("TagInput"),
          responses: { "201": response(ref("Tag")), ...commonErrors },
        },
      },
      "/search": {
        get: {
          operationId: "searchNotes",
          tags: ["search"],
          security: bearerSecurity,
          parameters: [
            {
              name: "query",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 500 },
            },
            { name: "folderId", in: "query", schema: { type: "string" } },
            { name: "tagId", in: "query", schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
            },
          ],
          responses: {
            "200": response(arrayOf(ref("SearchHit"))),
            ...commonErrors,
          },
        },
      },
      "/search/query": {
        post: {
          operationId: "searchNotesWithCredentials",
          tags: ["search"],
          security: bearerSecurity,
          requestBody: body("SearchRequestInput"),
          responses: {
            "200": response({
              type: "object",
              required: ["hits", "mode", "credentialRequired"],
              properties: {
                hits: arrayOf(ref("SearchHit")),
                mode: { type: "string", enum: ["HYBRID", "LEXICAL"] },
                credentialRequired: { type: "boolean" },
              },
            }),
            ...commonErrors,
          },
        },
      },
      "/tasks": {
        get: {
          operationId: "listTasks",
          tags: ["tasks"],
          security: bearerSecurity,
          responses: { "200": response(arrayOf(ref("Task"))), ...commonErrors },
        },
        post: {
          operationId: "createTask",
          tags: ["tasks"],
          security: bearerSecurity,
          parameters: [idempotencyParameter],
          requestBody: body("TaskInput"),
          responses: { "201": response(ref("Task")), ...commonErrors },
        },
      },
      "/tasks/{id}": {
        patch: {
          operationId: "updateTask",
          tags: ["tasks"],
          security: bearerSecurity,
          parameters: [idParameter, idempotencyParameter],
          requestBody: body("TaskPatchInput"),
          responses: { "200": response(ref("Task")), ...commonErrors },
        },
      },
      "/transfer/import": {
        post: {
          operationId: "importNote",
          tags: ["transfer"],
          security: bearerSecurity,
          parameters: [idempotencyParameter],
          requestBody: body("ImportInput"),
          responses: { "201": response(ref("Note")), ...commonErrors },
        },
      },
      "/ai/providers": {
        get: {
          operationId: "listProviderConfigs",
          tags: ["ai-providers"],
          security: bearerSecurity,
          responses: {
            "200": response(arrayOf(ref("ProviderConfig"))),
            ...commonErrors,
          },
        },
        post: {
          operationId: "createProviderConfig",
          tags: ["ai-providers"],
          security: bearerSecurity,
          requestBody: body("ProviderConfigInput"),
          responses: {
            "201": response(ref("ProviderConfig")),
            ...commonErrors,
          },
        },
      },
      "/ai/providers/{id}": {
        patch: {
          operationId: "updateProviderConfig",
          tags: ["ai-providers"],
          security: bearerSecurity,
          parameters: [idParameter],
          requestBody: body("ProviderConfigPatchInput"),
          responses: {
            "200": response(ref("ProviderConfig")),
            ...commonErrors,
          },
        },
        delete: {
          operationId: "deleteProviderConfig",
          tags: ["ai-providers"],
          security: bearerSecurity,
          parameters: [idParameter],
          responses: {
            "200": response({
              type: "object",
              required: ["ok"],
              properties: { ok: { type: "boolean" } },
            }),
            ...commonErrors,
          },
        },
      },
      "/ai/providers/{id}/test": {
        post: {
          operationId: "testProviderConfig",
          tags: ["ai-providers"],
          security: bearerSecurity,
          parameters: [idParameter],
          requestBody: body("ProviderCredentialInput"),
          responses: {
            "201": response({ type: "object", additionalProperties: true }),
            ...commonErrors,
          },
        },
      },
      "/ai/providers/{id}/models": {
        post: {
          operationId: "listProviderModels",
          tags: ["ai-providers"],
          security: bearerSecurity,
          parameters: [idParameter],
          requestBody: body("ProviderCredentialInput"),
          responses: {
            "200": response({
              type: "object",
              required: ["models"],
              properties: {
                models: { type: "array", items: { type: "string" } },
              },
            }),
            ...commonErrors,
          },
        },
      },
      "/ai/notes/{id}/tag-suggestions": {
        post: {
          operationId: "suggestNoteTags",
          tags: ["ai-actions"],
          security: bearerSecurity,
          parameters: [idParameter],
          requestBody: body("TagSuggestionInput"),
          responses: {
            "201": response({
              type: "object",
              required: ["tags"],
              properties: {
                tags: {
                  type: "array",
                  maxItems: 8,
                  items: { type: "string", maxLength: 40 },
                },
              },
            }),
            ...commonErrors,
          },
        },
      },
      "/chat/ask": {
        post: {
          operationId: "askKnowledgeBase",
          tags: ["chat"],
          security: bearerSecurity,
          requestBody: body("AskWithCredentialsInput"),
          responses: {
            "201": response({ type: "object", additionalProperties: true }),
            ...commonErrors,
          },
        },
      },
      "/chat/conversations": {
        get: {
          operationId: "listConversations",
          tags: ["chat"],
          security: bearerSecurity,
          responses: {
            "200": response(arrayOf(ref("Conversation"))),
            ...commonErrors,
          },
        },
        post: {
          operationId: "createConversation",
          tags: ["chat"],
          security: bearerSecurity,
          requestBody: body("ConversationCreateInput"),
          responses: { "201": response(ref("Conversation")), ...commonErrors },
        },
      },
      "/chat/conversations/{id}": {
        get: {
          operationId: "getConversation",
          tags: ["chat"],
          security: bearerSecurity,
          parameters: [idParameter],
          responses: { "200": response(ref("Conversation")), ...commonErrors },
        },
        patch: {
          operationId: "updateConversation",
          tags: ["chat"],
          security: bearerSecurity,
          parameters: [idParameter],
          requestBody: body("ConversationPatchInput"),
          responses: { "200": response(ref("Conversation")), ...commonErrors },
        },
        delete: {
          operationId: "deleteConversation",
          tags: ["chat"],
          security: bearerSecurity,
          parameters: [idParameter],
          responses: {
            "200": response({ type: "object", additionalProperties: true }),
            ...commonErrors,
          },
        },
      },
      "/chat/conversations/{id}/messages/stream": {
        post: {
          operationId: "streamChatMessage",
          tags: ["chat"],
          security: bearerSecurity,
          parameters: [idParameter],
          requestBody: body("ChatMessageInput"),
          responses: {
            "200": {
              description: "SSE 消息流",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            ...commonErrors,
          },
        },
      },
      "/chat/messages/{id}/regenerate/stream": {
        post: {
          operationId: "regenerateChatMessage",
          tags: ["chat"],
          security: bearerSecurity,
          parameters: [idParameter],
          requestBody: body("ChatMessageInput"),
          responses: {
            "200": {
              description: "SSE 消息流",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            ...commonErrors,
          },
        },
      },
      "/chat/runs/{id}/cancel": {
        post: {
          operationId: "cancelChatRun",
          tags: ["chat"],
          security: bearerSecurity,
          parameters: [idParameter],
          responses: {
            "201": response({ type: "object", additionalProperties: true }),
            ...commonErrors,
          },
        },
      },
      "/chat/messages/{id}/save-to-note": {
        post: {
          operationId: "saveChatMessageToNote",
          tags: ["chat"],
          security: bearerSecurity,
          parameters: [idParameter],
          requestBody: body("SaveMessageToNoteInput"),
          responses: { "201": response(ref("Note")), ...commonErrors },
        },
      },
      "/ai/runs/{id}/apply": {
        post: {
          operationId: "applyAiAction",
          tags: ["ai-actions"],
          security: bearerSecurity,
          parameters: [idParameter],
          requestBody: body("AiActionApplyInput"),
          responses: {
            "201": response({ type: "object", additionalProperties: true }),
            ...commonErrors,
          },
        },
      },
      "/ai/runs/{id}/cancel": {
        post: {
          operationId: "cancelAiAction",
          tags: ["ai-actions"],
          security: bearerSecurity,
          parameters: [idParameter],
          responses: {
            "201": response({ type: "object", additionalProperties: true }),
            ...commonErrors,
          },
        },
      },
      "/ai/actions/stream": {
        post: {
          operationId: "streamAiAction",
          tags: ["ai-actions"],
          security: bearerSecurity,
          requestBody: body("AiActionInput"),
          responses: {
            "200": {
              description: "SSE AI 操作流",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            ...commonErrors,
          },
        },
      },
      "/ai/jobs/waiting": {
        get: {
          operationId: "listWaitingAiJobs",
          tags: ["ai-actions"],
          security: bearerSecurity,
          responses: {
            "200": response(
              arrayOf({ type: "object", additionalProperties: true }),
            ),
            ...commonErrors,
          },
        },
      },
      "/ai/jobs/{id}/process/stream": {
        post: {
          operationId: "processWaitingAiJob",
          tags: ["ai-actions"],
          security: bearerSecurity,
          parameters: [idParameter],
          requestBody: body("CredentialBundleInput"),
          responses: {
            "200": {
              description: "SSE 前台作业流",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            ...commonErrors,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque" },
        cookieAuth: { type: "apiKey", in: "cookie", name: "ai_note_session" },
      },
      schemas: components,
    },
  };
}
