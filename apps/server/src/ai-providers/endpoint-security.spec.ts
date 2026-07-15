import { describe, expect, it } from 'vitest';
import { isPrivateAddress } from './endpoint-security';

describe('模型地址 SSRF 防护', () => {
  it('识别 IPv4 与 IPv6 的本机和内网地址', () => {
    for (const address of ['127.0.0.1', '10.0.0.2', '172.16.1.1', '192.168.1.1', '169.254.1.2', '::1', 'fd00::1', 'fe80::1']) expect(isPrivateAddress(address)).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2001:4860:4860::8888')).toBe(false);
  });
});
