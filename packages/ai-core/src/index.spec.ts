import { describe, expect, it } from 'vitest';
import { MockModelGateway } from './index';

describe('MockModelGateway', () => {
  it('分析结果不会覆盖原文并能提取待办', async () => {
    const model = new MockModelGateway();
    const result = await model.analyze('数据库排查记录\n\nTODO: 补充连接池监控\n#数据库');
    expect(result.title).toBe('数据库排查记录');
    expect(result.tags).toContain('数据库');
    expect(result.tasks[0]?.title).toContain('补充连接池监控');
  });
  it('没有来源时明确返回资料不足且不生成引用', async () => {
    const result = await new MockModelGateway().answer('答案是什么？', []);
    expect(result.answer).toContain('资料不足');
    expect(result.citedBlockIds).toEqual([]);
  });
});
