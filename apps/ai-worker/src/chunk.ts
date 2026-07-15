export function splitText(text: string, maxLength = 800): string[] {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > maxLength) { chunks.push(current); current = ''; }
    if (paragraph.length > maxLength) {
      if (current) { chunks.push(current); current = ''; }
      for (let offset = 0; offset < paragraph.length; offset += maxLength) chunks.push(paragraph.slice(offset, offset + maxLength));
    } else current = current ? `${current}\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}
