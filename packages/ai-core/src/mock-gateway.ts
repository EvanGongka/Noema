import type { ZodType } from 'zod';
import { BaseModelGateway } from './base-gateway';
import type { AiContext, AnalysisResult, ChatResult, GatewayConfig, StreamChatRequest, StreamEvent, StructuredRequest } from './types';

function stableVector(text: string, dimensions = 1536): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const terms = [...normalized.replace(/[^\p{L}\p{N}]/gu, ''), ...normalized.split(/[^\p{L}\p{N}_-]+/u).filter(Boolean)];
  for (const term of terms) {
    let hash = 2166136261;
    for (const character of term) { hash ^= character.codePointAt(0) ?? 0; hash = Math.imul(hash, 16777619); }
    const slot = (hash >>> 0) % dimensions;
    vector[slot] = (vector[slot] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export class MockModelGateway extends BaseModelGateway {
  constructor(config: Partial<GatewayConfig> = {}) {
    super({ provider: 'MOCK', baseUrl: 'mock://local', chatModel: 'mock', embeddingModel: 'mock-embedding', ...config });
  }

  async *streamChat(request: StreamChatRequest): AsyncGenerator<StreamEvent> {
    yield { type: 'meta', provider: this.provider, model: request.model || this.model };
    const last = request.messages.at(-1)?.content ?? '';
    const grounded = request.messages.some((message) => message.role === 'system' && message.content.includes('只能使用以下编号资料'));
    const text = grounded
      ? `根据当前笔记，${last.replace(/<[^>]+>/g, '').slice(0, 300)} 的相关信息见引用。[1]`
      : `这是模拟 AI 回答：${last.replace(/<[^>]+>/g, '').slice(0, 500)}`;
    for (let index = 0; index < text.length; index += 24) yield { type: 'delta', text: text.slice(index, index + 24) };
    yield { type: 'usage', usage: { inputTokens: last.length, outputTokens: text.length } };
    yield { type: 'done', finishReason: 'stop' };
  }

  async generateStructured<T>(request: StructuredRequest, schema: ZodType<T>): Promise<T> {
    const content = request.messages.at(-1)?.content ?? '';
    const result = await this.analyze(content.replace(/<[^>]+>/g, ''));
    return schema.parse(result);
  }

  async analyze(content: string): Promise<AnalysisResult> {
    const firstLine = content.split(/\n+/).map((line) => line.trim()).find(Boolean) ?? '无标题笔记';
    const taskMatches = [...content.matchAll(/(?:待办|TODO|任务)[:：]?\s*([^\n。]+)/gi)];
    return {
      title: firstLine.slice(0, 80), summary: content.replace(/\s+/g, ' ').trim().slice(0, 300),
      keyPoints: content.split(/[。！？\n]+/).map((item) => item.trim()).filter(Boolean).slice(0, 5),
      tags: [...new Set((content.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map((tag) => tag.slice(1)))].slice(0, 8),
      topics: [], questions: ['这篇笔记最重要的结论是什么？'],
      tasks: taskMatches.slice(0, 20).map((match) => ({ title: match[1]?.trim() ?? '待处理事项', dueAt: null }))
    };
  }

  async answer(question: string, contexts: AiContext[]): Promise<ChatResult> {
    if (!contexts.length) return { answer: '资料不足：当前查询范围内没有找到能够支持回答的笔记。', citedBlockIds: [], certainty: 'LOW', usage: { inputTokens: question.length, outputTokens: 24 } };
    const selected = contexts.slice(0, 3);
    const evidence = selected.map((context, index) => `[${index + 1}]《${context.title}》：${context.content.slice(0, 180)}`).join('\n');
    return { answer: `根据当前笔记，可以得到以下信息：\n${evidence}`, citedBlockIds: selected.map((context) => context.blockId), certainty: selected.length >= 2 ? 'HIGH' : 'MEDIUM', usage: { inputTokens: question.length + evidence.length, outputTokens: evidence.length } };
  }

  async embed(contents: string[]): Promise<number[][]> { return contents.map((content) => stableVector(content)); }
  async listModels(): Promise<string[]> { return ['mock']; }
}
