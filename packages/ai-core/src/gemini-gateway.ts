import { z } from 'zod';
import { BaseModelGateway } from './base-gateway';
import { normalizeBaseUrl, requestJson, requestStream, sseData } from './http';
import type { GatewayConfig, StreamChatRequest, StreamEvent } from './types';

export class GeminiGateway extends BaseModelGateway {
  private readonly baseUrl: string;
  constructor(config: GatewayConfig) { super(config); this.baseUrl = normalizeBaseUrl(config.baseUrl || 'https://generativelanguage.googleapis.com'); }

  async *streamChat(request: StreamChatRequest): AsyncGenerator<StreamEvent> {
    const model = request.model || this.model;
    yield { type: 'meta', provider: this.provider, model };
    const system = request.messages.filter((item) => item.role === 'system').map((item) => item.content).join('\n');
    const contents = request.messages.filter((item) => item.role !== 'system').map((item) => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.content }] }));
    const response = await requestStream(`${this.baseUrl}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.config.apiKey ?? '')}`, {
      method: 'POST', signal: request.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents,
        generationConfig: { temperature: request.temperature ?? 0.2, ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}) }
      })
    }, this.config.timeoutMs);
    let inputTokens = 0; let outputTokens = 0;
    for await (const data of sseData(response)) {
      const parsed = z.object({
        candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }) })).default([]),
        usageMetadata: z.object({ promptTokenCount: z.number().optional(), candidatesTokenCount: z.number().optional() }).optional()
      }).passthrough().parse(JSON.parse(data));
      for (const candidate of parsed.candidates) for (const part of candidate.content.parts) if (part.text) yield { type: 'delta', text: part.text };
      inputTokens = parsed.usageMetadata?.promptTokenCount ?? inputTokens;
      outputTokens = parsed.usageMetadata?.candidatesTokenCount ?? outputTokens;
    }
    yield { type: 'usage', usage: { inputTokens, outputTokens } };
    yield { type: 'done' };
  }

  async embed(contents: string[], signal?: AbortSignal): Promise<number[][]> {
    if (!contents.length) return [];
    if (!this.config.embeddingModel) throw new Error('未配置嵌入模型');
    const model = this.config.embeddingModel;
    const response = await requestJson(`${this.baseUrl}/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents?key=${encodeURIComponent(this.config.apiKey ?? '')}`, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: contents.map((text) => ({ model: `models/${model}`, content: { parts: [{ text }] } })) })
    }, this.config.timeoutMs);
    return z.object({ embeddings: z.array(z.object({ values: z.array(z.number()) })) }).parse(response).embeddings.map((item) => item.values);
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await requestJson(`${this.baseUrl}/v1beta/models?key=${encodeURIComponent(this.config.apiKey ?? '')}`, { signal }, this.config.timeoutMs);
    return z.object({ models: z.array(z.object({ name: z.string() })) }).parse(response).models.map((item) => item.name.replace(/^models\//, '')).sort();
  }
}
