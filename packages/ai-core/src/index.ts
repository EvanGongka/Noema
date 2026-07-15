export { analysisResultSchema, BaseModelGateway } from './base-gateway';
export { decryptCredential, encryptCredential, maskCredential } from './credentials';
export { AnthropicGateway } from './anthropic-gateway';
export { GeminiGateway } from './gemini-gateway';
export { MockModelGateway } from './mock-gateway';
export { OllamaGateway } from './ollama-gateway';
export { OpenAiCompatibleGateway } from './openai-gateway';
export * from './types';
export { normalizeVectorDimensions, vectorLiteral } from './vector';

import { AnthropicGateway } from './anthropic-gateway';
import { GeminiGateway } from './gemini-gateway';
import { MockModelGateway } from './mock-gateway';
import { OllamaGateway } from './ollama-gateway';
import { OpenAiCompatibleGateway } from './openai-gateway';
import type { GatewayConfig, ModelGateway, ProviderKind } from './types';

export function createModelGateway(config?: GatewayConfig): ModelGateway {
  const resolved = config ?? environmentConfig();
  switch (resolved.provider) {
    case 'OPENAI_COMPATIBLE': return new OpenAiCompatibleGateway(resolved);
    case 'ANTHROPIC': return new AnthropicGateway(resolved);
    case 'GEMINI': return new GeminiGateway(resolved);
    case 'OLLAMA': return new OllamaGateway(resolved);
    default: return new MockModelGateway(resolved);
  }
}

function environmentConfig(): GatewayConfig {
  const raw = (process.env.AI_PROVIDER || 'mock').toUpperCase().replace(/-/g, '_');
  const provider: ProviderKind = raw === 'OPENAI' ? 'OPENAI_COMPATIBLE' : ['OPENAI_COMPATIBLE', 'ANTHROPIC', 'GEMINI', 'OLLAMA'].includes(raw) ? raw as ProviderKind : 'MOCK';
  const defaults: Record<ProviderKind, { baseUrl: string; model: string }> = {
    OPENAI_COMPATIBLE: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
    ANTHROPIC: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5' },
    GEMINI: { baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash' },
    OLLAMA: { baseUrl: 'http://localhost:11434', model: 'qwen3:8b' },
    MOCK: { baseUrl: 'mock://local', model: 'mock' }
  };
  return {
    provider,
    baseUrl: process.env.AI_BASE_URL || defaults[provider].baseUrl,
    apiKey: process.env.AI_API_KEY,
    chatModel: process.env.AI_CHAT_MODEL || defaults[provider].model,
    embeddingModel: process.env.AI_EMBEDDING_MODEL || (provider === 'MOCK' ? 'mock-embedding' : undefined),
    apiMode: process.env.AI_OPENAI_API_MODE === 'RESPONSES' ? 'RESPONSES' : 'CHAT_COMPLETIONS'
  };
}
