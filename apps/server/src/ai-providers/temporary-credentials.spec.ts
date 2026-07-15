import { describe, expect, it } from 'vitest';
import { chatMessageSchema, credentialBundleSchema, providerConfigSchema, providerCredentialSchema } from '@ai-note/schemas';

describe('临时模型凭据契约', () => {
  it('拒绝把 API Key 混入服务端供应商配置', () => {
    const result = providerConfigSchema.safeParse({
      provider: 'OPENAI_COMPATIBLE',
      name: '默认模型',
      baseUrl: 'https://example.com/v1',
      chatModel: 'example-chat',
      apiKey: '不应进入服务端配置'
    });
    expect(result.success).toBe(false);
  });

  it('一个请求最多携带两个且不可重复的临时凭据', () => {
    const credentials = [
      { configId: 'clx000000000000000000001', apiKey: 'a' },
      { configId: 'clx000000000000000000002', apiKey: 'b' },
      { configId: 'clx000000000000000000003', apiKey: 'c' }
    ];
    expect(credentialBundleSchema.safeParse({ credentials }).success).toBe(false);
    expect(providerCredentialSchema.safeParse({ credentials: credentials.slice(0, 2) }).success).toBe(false);
  });

  it('AI 流式请求默认不携带凭据并允许请求级临时授权', () => {
    expect(chatMessageSchema.parse({ content: '你好' }).credentials).toEqual([]);
    const parsed = chatMessageSchema.parse({ content: '你好', credentials: [{ configId: 'clx000000000000000000001', apiKey: 'local-only' }] });
    expect(parsed.credentials).toHaveLength(1);
  });
});
