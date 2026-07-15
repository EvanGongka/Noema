export interface NoteTag {
  id: string;
  name: string;
  color: string;
}

export interface SearchableNote {
  title: string;
  plainText: string;
  tags?: Array<{ tag: NoteTag }>;
}

export function markdownDocument(source: string) {
  return { type: "markdown", version: 1, source } as const;
}

export function noteMatches(
  note: SearchableNote,
  query: string,
  tagId?: string,
): boolean {
  if (tagId && !note.tags?.some((entry) => entry.tag.id === tagId))
    return false;
  const terms = query
    .trim()
    .toLocaleLowerCase("zh-CN")
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return true;
  const searchable = [
    note.title,
    note.plainText,
    ...(note.tags?.map((entry) => entry.tag.name) ?? []),
  ]
    .join("\n")
    .toLocaleLowerCase("zh-CN");
  return terms.every((term) => searchable.includes(term));
}

export function mergeTagIds(current: string[], additions: string[]): string[] {
  return [...new Set([...current, ...additions])];
}
