import { z } from 'zod';
import { BaseModelGateway } from './base-gateway';
import { lines, normalizeBaseUrl, requestJson, requestStream } from './http';
import type { GatewayConfig, StreamChatRequest, StreamEvent } from './types';

export class OllamaGateway extends BaseModelGateway {
  private readonly baseUrl: string;
  constructor(config: GatewayConfig) { super(config); this.baseUrl = normalizeBaseUrl(config.baseUrl || 'http://localhost:11434'); }

  async *streamChat(request: StreamChatRequest): AsyncGenerator<StreamEvent> {
    const model = request.model || this.model;
    yield { type: 'meta', provider: this.provider, model };
    const response = await requestStream(`${this.baseUrl}/api/chat`, {
      method: 'POST', signal: request.signal, headers: this.headers(), body: JSON.stringify({
        model, messages: request.messages, stream: true,
        options: { temperature: request.temperature ?? 0.2, ...(request.maxOutputTokens ? { num_predict: request.maxOutputTokens } : {}) }
      })
    }, this.config.timeoutMs);
    for await (const line of lines(response)) {
      const parsed = z.object({ message: z.object({ content: z.string().optional() }).optional(), done: z.boolean().optional(), prompt_eval_count: z.number().optional(), eval_count: z.number().optional(), done_reason: z.string().optional() }).passthrough().parse(JSON.parse(line));
      if (parsed.message?.content) yield { type: 'delta', text: parsed.message.content };
      if (parsed.done) {
        yield { type: 'usage', usage: { inputTokens: parsed.prompt_eval_count ?? 0, outputTokens: parsed.eval_count ?? 0 } };
        yield { type: 'done', finishReason: parsed.done_reason };
      }
    }
  }

  async embed(contents: string[], signal?: AbortSignal): Promise<number[][]> {
    if (!contents.length) return [];
    if (!this.config.embeddingModel) throw new Error('未配置嵌入模型');
    const response = await requestJson(`${this.baseUrl}/api/embed`, { method: 'POST', signal, headers: this.headers(), body: JSON.stringify({ model: this.config.embeddingModel, input: contents }) }, this.config.timeoutMs);
    return z.object({ embeddings: z.array(z.array(z.number())) }).parse(response).embeddings;
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await requestJson(`${this.baseUrl}/api/tags`, { headers: this.headers(), signal }, this.config.timeoutMs);
    return z.object({ models: z.array(z.object({ name: z.string() })) }).parse(response).models.map((item) => item.name).sort();
  }

  private headers() { return { ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}), 'Content-Type': 'application/json' }; }
}
