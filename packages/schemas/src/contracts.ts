import { z } from "zod";

export const emailSchema = z
  .string()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(8).max(128);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(80),
});
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export const mobileDeviceSchema = z.object({
  deviceId: z.string().trim().min(8).max(128),
  deviceName: z.string().trim().min(1).max(120),
});
export const mobileRegisterSchema = registerSchema.merge(mobileDeviceSchema);
export const mobileLoginSchema = loginSchema.merge(mobileDeviceSchema);
export const mobileRefreshSchema = z.object({
  refreshToken: z.string().min(32).max(512),
  deviceId: z.string().trim().min(8).max(128),
});
export const deleteAccountSchema = z.object({ password: passwordSchema });
export const noteSchema = z.object({
  title: z.string().max(200).default("无标题笔记"),
  content: z.record(z.unknown()).default({ type: "doc", content: [] }),
  plainText: z.string().max(2_000_000).default(""),
  folderId: z.string().cuid().nullable().optional(),
  status: z.enum(["INBOX", "ACTIVE", "ARCHIVED"]).default("INBOX"),
  aiEnabled: z.boolean().default(true),
  tagIds: z.array(z.string().cuid()).max(30).default([]),
});
export const notePatchSchema = noteSchema
  .partial()
  .extend({ version: z.number().int().nonnegative() });
export const searchSchema = z.object({
  query: z.string().min(1).max(500),
  folderId: z.string().cuid().optional(),
  tagId: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const askSchema = z.object({
  question: z.string().min(1).max(2000),
  scope: z.enum(["NOTE", "FOLDER", "WORKSPACE"]).default("WORKSPACE"),
  noteId: z.string().cuid().optional(),
  folderId: z.string().cuid().optional(),
});

export const aiProviderSchema = z.enum([
  "OPENAI_COMPATIBLE",
  "ANTHROPIC",
  "GEMINI",
  "OLLAMA",
]);
export const providerConfigSchema = z
  .object({
    provider: aiProviderSchema,
    name: z.string().trim().min(1).max(80),
    baseUrl: z.string().url().max(500),
    chatModel: z.string().trim().min(1).max(200),
    apiMode: z.enum(["CHAT_COMPLETIONS", "RESPONSES"]).optional(),
    embeddingModel: z.string().trim().max(200).nullable().optional(),
    enabled: z.boolean().default(true),
    isDefaultChat: z.boolean().default(false),
    isDefaultEmbedding: z.boolean().default(false),
  })
  .strict();
export const providerConfigPatchSchema = providerConfigSchema.partial();

export const temporaryCredentialSchema = z
  .object({
    configId: z.string().cuid(),
    apiKey: z.string().max(4096).default(""),
  })
  .strict();
export const temporaryCredentialsSchema = z
  .array(temporaryCredentialSchema)
  .max(2)
  .default([]);
export const credentialBundleSchema = z
  .object({
    credentials: temporaryCredentialsSchema,
  })
  .refine(
    (value) =>
      new Set(value.credentials.map((item) => item.configId)).size ===
      value.credentials.length,
    { message: "临时凭据不能包含重复配置" },
  );
export const tagSuggestionSchema = z
  .object({
    providerConfigId: z.string().cuid().nullable().optional(),
    credentials: temporaryCredentialsSchema,
  })
  .refine(
    (value) =>
      new Set(value.credentials.map((item) => item.configId)).size ===
      value.credentials.length,
    { message: "临时凭据不能包含重复配置" },
  );
export const providerCredentialSchema = credentialBundleSchema.refine(
  (value) => value.credentials.length <= 1,
  { message: "连接测试和模型列表一次只允许一个临时凭据" },
);

export const conversationModeSchema = z.enum(["KNOWLEDGE", "GENERAL"]);
export const conversationScopeSchema = z.enum(["NOTE", "FOLDER", "WORKSPACE"]);
export const conversationCreateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  mode: conversationModeSchema.default("KNOWLEDGE"),
  scope: conversationScopeSchema.default("WORKSPACE"),
  noteId: z.string().cuid().nullable().optional(),
  folderId: z.string().cuid().nullable().optional(),
  providerConfigId: z.string().cuid().nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
});
export const conversationPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  archived: z.boolean().optional(),
  mode: conversationModeSchema.optional(),
  scope: conversationScopeSchema.optional(),
  noteId: z.string().cuid().nullable().optional(),
  folderId: z.string().cuid().nullable().optional(),
  providerConfigId: z.string().cuid().nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
});
export const chatMessageSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  providerConfigId: z.string().cuid().nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  credentials: temporaryCredentialsSchema,
});
export const saveMessageToNoteSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("CREATE"),
    title: z.string().trim().min(1).max(200).optional(),
    folderId: z.string().cuid().nullable().optional(),
    includeQuestion: z.boolean().default(true),
    includeCitations: z.boolean().default(true),
  }),
  z.object({
    mode: z.literal("APPEND"),
    noteId: z.string().cuid(),
    version: z.number().int().nonnegative(),
    includeQuestion: z.boolean().default(true),
    includeCitations: z.boolean().default(true),
  }),
]);

export const aiActionTypeSchema = z.enum([
  "SUMMARIZE",
  "ANALYZE",
  "EXPLAIN",
  "POLISH",
  "REWRITE",
  "CONTINUE",
  "TRANSLATE",
  "OUTLINE",
  "BRAINSTORM",
  "SUGGEST_QUESTIONS",
  "EXTRACT_TASKS",
  "FIND_RELATED",
  "CUSTOM",
]);
export const aiActionSchema = z.object({
  action: aiActionTypeSchema,
  noteId: z.string().cuid().optional(),
  text: z.string().min(1).max(200_000),
  instruction: z.string().max(2000).optional(),
  targetLanguage: z.string().max(80).optional(),
  providerConfigId: z.string().cuid().nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  credentials: temporaryCredentialsSchema,
});
export const searchRequestSchema = searchSchema.extend({
  credentials: temporaryCredentialsSchema,
});
export const askWithCredentialsSchema = askSchema.extend({
  credentials: temporaryCredentialsSchema,
});
export const aiActionApplySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("CREATE_NOTE"),
    title: z.string().trim().min(1).max(200).optional(),
    folderId: z.string().cuid().nullable().optional(),
  }),
  z.object({
    mode: z.literal("APPEND_NOTE"),
    noteId: z.string().cuid(),
    version: z.number().int().nonnegative(),
  }),
  z.object({
    mode: z.literal("REPLACE_NOTE"),
    noteId: z.string().cuid(),
    version: z.number().int().nonnegative(),
  }),
  z.object({
    mode: z.literal("CREATE_TASKS"),
    noteId: z.string().cuid(),
    sourceBlockId: z.string().cuid().nullable().optional(),
  }),
  z.object({
    mode: z.literal("CLIENT_APPLIED"),
    noteId: z.string().cuid(),
    version: z.number().int().nonnegative(),
    applyMode: z.enum(["INSERT", "REPLACE"]),
  }),
]);
export const taskSchema = z.object({
  title: z.string().min(1).max(300),
  dueAt: z.string().datetime().nullable().optional(),
  sourceNoteId: z.string().cuid(),
  sourceBlockId: z.string().cuid().nullable().optional(),
});
export const taskPatchSchema = z.object({
  status: z.enum(["TODO", "DOING", "DONE"]),
});
export const folderSchema = z.object({
  name: z.string().min(1).max(80),
  parentId: z.string().cuid().nullable().optional(),
});
export const tagSchema = z.object({
  name: z.string().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#596B5B"),
});
export const fileSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
  noteId: z.string().cuid().optional(),
});
export const fileConfirmSchema = fileSchema.extend({
  key: z.string().min(1).max(500),
});
export const importSchema = z.object({
  filename: z.string().regex(/\.(md|markdown|txt)$/i),
  content: z.string().max(2_000_000),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type MobileRegisterInput = z.infer<typeof mobileRegisterSchema>;
export type MobileLoginInput = z.infer<typeof mobileLoginSchema>;
export type MobileRefreshInput = z.infer<typeof mobileRefreshSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type NotePatchInput = z.infer<typeof notePatchSchema>;
export type AskInput = z.infer<typeof askSchema>;
export type ProviderConfigInput = z.infer<typeof providerConfigSchema>;
export type ProviderConfigPatchInput = z.infer<
  typeof providerConfigPatchSchema
>;
export type TemporaryCredentialInput = z.infer<
  typeof temporaryCredentialSchema
>;
export type CredentialBundleInput = z.infer<typeof credentialBundleSchema>;
export type TagSuggestionInput = z.infer<typeof tagSuggestionSchema>;
export type ProviderCredentialInput = z.infer<typeof providerCredentialSchema>;
export type ConversationCreateInput = z.infer<typeof conversationCreateSchema>;
export type ConversationPatchInput = z.infer<typeof conversationPatchSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type SaveMessageToNoteInput = z.infer<typeof saveMessageToNoteSchema>;
export type AiActionInput = z.infer<typeof aiActionSchema>;
export type SearchRequestInput = z.infer<typeof searchRequestSchema>;
export type AskWithCredentialsInput = z.infer<typeof askWithCredentialsSchema>;
export type AiActionApplyInput = z.infer<typeof aiActionApplySchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type TaskPatchInput = z.infer<typeof taskPatchSchema>;
export type FolderInput = z.infer<typeof folderSchema>;
export type TagInput = z.infer<typeof tagSchema>;
export type FileInput = z.infer<typeof fileSchema>;
export type FileConfirmInput = z.infer<typeof fileConfirmSchema>;
export type ImportInput = z.infer<typeof importSchema>;
