import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicGateway, GeminiGateway, OllamaGateway, OpenAiCompatibleGateway } from './index';
import type { ModelGateway, StreamEvent } from './types';

async function collect(gateway: ModelGateway) {
  const events: StreamEvent[] = [];
  for await (const event of gateway.streamChat({ messages: [{ role: 'user', content: '你好' }] })) events.push(event);
  return events;
}

function mockStream(body: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })));
}

afterEach(() => vi.unstubAllGlobals());

describe('多供应商流式协议', () => {
  it('解析 OpenAI Chat Completions SSE', async () => {
    mockStream('data: {"choices":[{"delta":{"content":"你"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":2}}\n\ndata: [DONE]\n\n');
    const events = await collect(new OpenAiCompatibleGateway({ provider: 'OPENAI_COMPATIBLE', baseUrl: 'https://example.com/v1', apiKey: 'test', chatModel: 'test', apiMode: 'CHAT_COMPLETIONS' }));
    expect(events.filter((event) => event.type === 'delta').map((event) => event.type === 'delta' ? event.text : '').join('')).toBe('你好');
    expect(events).toContainEqual({ type: 'usage', usage: { inputTokens: 2, outputTokens: 2 } });
  });

  it('解析 OpenAI Responses API SSE', async () => {
    mockStream('data: {"type":"response.output_text.delta","delta":"完成"}\n\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":1}}}\n\n');
    const events = await collect(new OpenAiCompatibleGateway({ provider: 'OPENAI_COMPATIBLE', baseUrl: 'https://example.com/v1', apiKey: 'test', chatModel: 'test', apiMode: 'RESPONSES' }));
    expect(events).toContainEqual({ type: 'delta', text: '完成' });
  });

  it('解析 Anthropic Messages SSE', async () => {
    mockStream('data: {"type":"message_start","message":{"usage":{"input_tokens":4,"output_tokens":0}}}\n\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude"}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\n');
    const events = await collect(new AnthropicGateway({ provider: 'ANTHROPIC', baseUrl: 'https://example.com', apiKey: 'test', chatModel: 'claude' }));
    expect(events).toContainEqual({ type: 'delta', text: 'Claude' });
    expect(events).toContainEqual({ type: 'usage', usage: { inputTokens: 4, outputTokens: 2 } });
  });

  it('解析 Gemini generateContent SSE', async () => {
    mockStream('data: {"candidates":[{"content":{"parts":[{"text":"Gemini"}]}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2}}\n\n');
    const events = await collect(new GeminiGateway({ provider: 'GEMINI', baseUrl: 'https://example.com', apiKey: 'test', chatModel: 'gemini' }));
    expect(events).toContainEqual({ type: 'delta', text: 'Gemini' });
    expect(events).toContainEqual({ type: 'usage', usage: { inputTokens: 5, outputTokens: 2 } });
  });

  it('解析 Ollama NDJSON', async () => {
    mockStream('{"message":{"content":"Ollama"},"done":false}\n{"done":true,"prompt_eval_count":6,"eval_count":2,"done_reason":"stop"}\n');
    const events = await collect(new OllamaGateway({ provider: 'OLLAMA', baseUrl: 'http://localhost:11434', chatModel: 'qwen' }));
    expect(events).toContainEqual({ type: 'delta', text: 'Ollama' });
    expect(events).toContainEqual({ type: 'usage', usage: { inputTokens: 6, outputTokens: 2 } });
  });
});
