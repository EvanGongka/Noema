import type { ZodType } from 'zod';

export type ProviderKind = 'OPENAI_COMPATIBLE' | 'ANTHROPIC' | 'GEMINI' | 'OLLAMA' | 'MOCK';
export type OpenAiApiMode = 'CHAT_COMPLETIONS' | 'RESPONSES';

export interface GatewayConfig {
  provider: ProviderKind;
  baseUrl: string;
  apiKey?: string;
  chatModel: string;
  embeddingModel?: string | null;
  apiMode?: OpenAiApiMode;
  timeoutMs?: number;
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiContext {
  noteId: string;
  blockId: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type StreamEvent =
  | { type: 'meta'; provider: ProviderKind; model: string }
  | { type: 'delta'; text: string }
  | { type: 'usage'; usage: Usage }
  | { type: 'done'; finishReason?: string }
  | { type: 'error'; code: string; message: string; retryable: boolean };

export interface StreamChatRequest {
  messages: AiMessage[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface StructuredRequest extends Omit<StreamChatRequest, 'signal'> {
  signal?: AbortSignal;
}

export interface AnalysisResult {
  title: string;
  summary: string;
  keyPoints: string[];
  tags: string[];
  topics: string[];
  questions: string[];
  tasks: Array<{ title: string; dueAt: string | null }>;
}

export interface ChatResult {
  answer: string;
  citedBlockIds: string[];
  certainty: 'LOW' | 'MEDIUM' | 'HIGH';
  usage: Usage;
}

export interface ConnectionTestResult {
  ok: boolean;
  provider: ProviderKind;
  modelCount: number;
  latencyMs: number;
}

export interface ModelGateway {
  readonly provider: ProviderKind;
  readonly model: string;
  streamChat(request: StreamChatRequest): AsyncGenerator<StreamEvent>;
  generateStructured<T>(request: StructuredRequest, schema: ZodType<T>): Promise<T>;
  embed(contents: string[], signal?: AbortSignal): Promise<number[][]>;
  listModels(signal?: AbortSignal): Promise<string[]>;
  testConnection(signal?: AbortSignal): Promise<ConnectionTestResult>;
  analyze(content: string): Promise<AnalysisResult>;
  answer(question: string, contexts: AiContext[]): Promise<ChatResult>;
}

export class ModelGatewayError extends Error {
  constructor(
    message: string,
    readonly code = 'MODEL_GATEWAY_ERROR',
    readonly retryable = false,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ModelGatewayError';
  }
}

export class EmbeddingUnavailableError extends ModelGatewayError {
  constructor(message = '当前模型供应商不支持向量生成，请配置独立的嵌入模型') {
    super(message, 'EMBEDDING_UNAVAILABLE', false);
  }
}
