import { describe, expect, it } from 'vitest';
import { bearerToken } from './auth.guard';

describe('Bearer 令牌解析', () => {
  it('只接受标准 Bearer 头', () => {
    expect(bearerToken('Bearer access-token')).toBe('access-token');
    expect(bearerToken('bearer access-token')).toBe('access-token');
  });

  it('拒绝缺失、错误协议和额外字段', () => {
    expect(bearerToken()).toBeUndefined();
    expect(bearerToken('Basic value')).toBeUndefined();
    expect(bearerToken('Bearer one two')).toBeUndefined();
  });
});
