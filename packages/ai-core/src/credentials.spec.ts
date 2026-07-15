import { describe, expect, it } from 'vitest';
import { decryptCredential, encryptCredential, maskCredential } from './credentials';

const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('模型凭据加密', () => {
  it('使用认证加密往返凭据且不泄露明文', () => {
    const encrypted = encryptCredential('sk-secret-value', key);
    expect(encrypted).not.toContain('sk-secret-value');
    expect(decryptCredential(encrypted, key)).toBe('sk-secret-value');
  });

  it('只展示安全掩码', () => {
    expect(maskCredential('sk-123456789')).toBe('sk-••••6789');
    expect(maskCredential('short')).toBe('••••••••');
    expect(maskCredential()).toBeNull();
  });
});
