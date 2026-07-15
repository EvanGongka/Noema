import { z } from 'zod';
import { BaseModelGateway } from './base-gateway';
import { normalizeBaseUrl, requestJson, requestStream, sseData } from './http';
import type { GatewayConfig, StreamChatRequest, StreamEvent } from './types';

const usageSchema = z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional(), input_tokens: z.number().optional(), output_tokens: z.number().optional() }).passthrough();

export class OpenAiCompatibleGateway extends BaseModelGateway {
  private readonly baseUrl: string;
  constructor(config: GatewayConfig) {
    super(config);
    this.baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.openai.com/v1');
  }

  async *streamChat(request: StreamChatRequest): AsyncGenerator<StreamEvent> {
    yield { type: 'meta', provider: this.provider, model: request.model || this.model };
    if (this.config.apiMode === 'RESPONSES') yield* this.streamResponses(request);
    else yield* this.streamChatCompletions(request);
  }

  private async *streamChatCompletions(request: StreamChatRequest): AsyncGenerator<StreamEvent> {
    const response = await requestStream(`${this.baseUrl}/chat/completions`, {
      method: 'POST', signal: request.signal, headers: this.headers(), body: JSON.stringify({
        model: request.model || this.model, messages: request.messages, stream: true, stream_options: { include_usage: true },
        temperature: request.temperature ?? 0.2, ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {})
      })
    }, this.config.timeoutMs);
    let finishReason: string | undefined;
    for await (const data of sseData(response)) {
      if (data === '[DONE]') break;
      const parsed = z.object({ choices: z.array(z.object({ delta: z.object({ content: z.string().nullable().optional() }).passthrough(), finish_reason: z.string().nullable().optional() })).default([]), usage: usageSchema.nullable().optional() }).passthrough().parse(JSON.parse(data));
      for (const choice of parsed.choices) {
        if (choice.delta.content) yield { type: 'delta', text: choice.delta.content };
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
      if (parsed.usage) yield { type: 'usage', usage: { inputTokens: parsed.usage.prompt_tokens ?? 0, outputTokens: parsed.usage.completion_tokens ?? 0 } };
    }
    yield { type: 'done', finishReason };
  }

  private async *streamResponses(request: StreamChatRequest): AsyncGenerator<StreamEvent> {
    const instructions = request.messages.filter((item) => item.role === 'system').map((item) => item.content).join('\n');
    const input = request.messages.filter((item) => item.role !== 'system').map((item) => ({ role: item.role, content: item.content }));
    const response = await requestStream(`${this.baseUrl}/responses`, {
      method: 'POST', signal: request.signal, headers: this.headers(), body: JSON.stringify({
        model: request.model || this.model, instructions, input, stream: true,
        temperature: request.temperature ?? 0.2, ...(request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : {})
      })
    }, this.config.timeoutMs);
    for await (const data of sseData(response)) {
      if (data === '[DONE]') break;
      const event = z.object({ type: z.string(), delta: z.string().optional(), response: z.object({ usage: usageSchema.optional() }).passthrough().optional() }).passthrough().parse(JSON.parse(data));
      if (event.type === 'response.output_text.delta' && event.delta) yield { type: 'delta', text: event.delta };
      const usage = event.response?.usage;
      if (event.type === 'response.completed' && usage) yield { type: 'usage', usage: { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 } };
    }
    yield { type: 'done' };
  }

  async embed(contents: string[], signal?: AbortSignal): Promise<number[][]> {
    if (!contents.length) return [];
    if (!this.config.embeddingModel) throw new Error('未配置嵌入模型');
    const response = await requestJson(`${this.baseUrl}/embeddings`, { method: 'POST', signal, headers: this.headers(), body: JSON.stringify({ model: this.config.embeddingModel, input: contents }) }, this.config.timeoutMs);
    const parsed = z.object({ data: z.array(z.object({ index: z.number(), embedding: z.array(z.number()) })) }).parse(response);
    return parsed.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await requestJson(`${this.baseUrl}/models`, { headers: this.headers(), signal }, this.config.timeoutMs);
    return z.object({ data: z.array(z.object({ id: z.string() })) }).parse(response).data.map((item) => item.id).sort();
  }

  private headers() {
    return { Authorization: `Bearer ${this.config.apiKey ?? ''}`, 'Content-Type': 'application/json' };
  }
}
