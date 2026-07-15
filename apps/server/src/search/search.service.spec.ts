import { describe, expect, it } from 'vitest';
import { lexicalScore } from './search.service';

describe('lexicalScore', () => {
  it('标题和正文精确命中获得更高分并说明原因', () => {
    const hit = lexicalScore('数据库连接失败', '数据库连接失败排查', '记录数据库连接失败的原因');
    const miss = lexicalScore('数据库连接失败', '摄影笔记', '闪光灯参数');
    expect(hit.score).toBeGreaterThan(miss.score);
    expect(hit.reasons).toContain('标题精确匹配');
  });
});
