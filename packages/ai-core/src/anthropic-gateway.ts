import { z } from 'zod';
import { BaseModelGateway } from './base-gateway';
import { normalizeBaseUrl, requestJson, requestStream, sseData } from './http';
import { EmbeddingUnavailableError, type GatewayConfig, type StreamChatRequest, type StreamEvent } from './types';

export class AnthropicGateway extends BaseModelGateway {
  private readonly baseUrl: string;
  constructor(config: GatewayConfig) { super(config); this.baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.anthropic.com'); }

  async *streamChat(request: StreamChatRequest): AsyncGenerator<StreamEvent> {
    yield { type: 'meta', provider: this.provider, model: request.model || this.model };
    const system = request.messages.filter((item) => item.role === 'system').map((item) => item.content).join('\n');
    const messages = request.messages.filter((item) => item.role !== 'system').map((item) => ({ role: item.role, content: item.content }));
    const response = await requestStream(`${this.baseUrl}/v1/messages`, {
      method: 'POST', signal: request.signal, headers: this.headers(), body: JSON.stringify({
        model: request.model || this.model, system, messages, stream: true,
        max_tokens: request.maxOutputTokens ?? 4096, temperature: request.temperature ?? 0.2
      })
    }, this.config.timeoutMs);
    let inputTokens = 0; let outputTokens = 0;
    for await (const data of sseData(response)) {
      const event = z.object({
        type: z.string(), delta: z.object({ type: z.string().optional(), text: z.string().optional() }).passthrough().optional(),
        message: z.object({ usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() }) }).passthrough().optional(),
        usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() }).optional()
      }).passthrough().parse(JSON.parse(data));
      if (event.type === 'content_block_delta' && event.delta?.text) yield { type: 'delta', text: event.delta.text };
      inputTokens = event.message?.usage.input_tokens ?? event.usage?.input_tokens ?? inputTokens;
      outputTokens = event.message?.usage.output_tokens ?? event.usage?.output_tokens ?? outputTokens;
    }
    yield { type: 'usage', usage: { inputTokens, outputTokens } };
    yield { type: 'done' };
  }

  async embed(): Promise<number[][]> { throw new EmbeddingUnavailableError('Anthropic 不提供嵌入接口，请选择 OpenAI、Gemini 或 Ollama 嵌入模型'); }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await requestJson(`${this.baseUrl}/v1/models`, { headers: this.headers(), signal }, this.config.timeoutMs);
    return z.object({ data: z.array(z.object({ id: z.string() })) }).parse(response).data.map((item) => item.id).sort();
  }

  private headers() { return { 'x-api-key': this.config.apiKey ?? '', 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }; }
}
