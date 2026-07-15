export interface IdentifiedItem {
  id: string;
}

export function upsertByCandidateIds<T extends IdentifiedItem>(
  items: T[],
  candidateIds: Array<string | undefined>,
  create: () => T,
  update: (item: T) => T
): T[] {
  const ids = new Set(candidateIds.filter((id): id is string => Boolean(id)));
  const index = items.findIndex((item) => ids.has(item.id));
  if (index < 0) return [...items, update(create())];

  const next = [...items];
  next[index] = update(items[index]!);
  return next;
}
