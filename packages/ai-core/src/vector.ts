export function normalizeVectorDimensions(values: number[], dimensions = 1536): number[] {
  const result = new Array<number>(dimensions).fill(0);
  for (let index = 0; index < Math.min(values.length, dimensions); index += 1) result[index] = Number.isFinite(values[index]) ? values[index]! : 0;
  const norm = Math.sqrt(result.reduce((sum, value) => sum + value * value, 0)) || 1;
  return result.map((value) => value / norm);
}

export function vectorLiteral(values: number[], dimensions = 1536): string {
  return `[${normalizeVectorDimensions(values, dimensions).map((value) => value.toFixed(8)).join(',')}]`;
}
