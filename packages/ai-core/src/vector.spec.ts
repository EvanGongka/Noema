import { describe, expect, it } from 'vitest';
import { normalizeVectorDimensions, vectorLiteral } from './vector';

describe('向量维度归一化', () => {
  it('能够填充和截断供应商的不同向量维度', () => {
    expect(normalizeVectorDimensions([3, 4], 4)).toEqual([0.6, 0.8, 0, 0]);
    expect(normalizeVectorDimensions([1, 2, 3], 2)).toHaveLength(2);
    expect(vectorLiteral([1], 2)).toBe('[1.00000000,0.00000000]');
  });
});
