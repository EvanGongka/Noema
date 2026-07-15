import { describe, expect, it } from 'vitest';
import { splitText } from './chunk';

describe('splitText', () => {
  it('按段落切分并保留所有文字', () => {
    const chunks = splitText('第一段\n\n第二段', 10);
    expect(chunks).toEqual(['第一段\n第二段']);
  });
  it('长段落不会超过最大长度', () => {
    const chunks = splitText('a'.repeat(25), 10);
    expect(chunks.map((item) => item.length)).toEqual([10, 10, 5]);
  });
});
