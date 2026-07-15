import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeVectorDimensions, vectorLiteral } from '@ai-note/ai-core';
import type { TemporaryCredentialInput } from '@ai-note/schemas';
import type { SearchHit } from '@ai-note/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AiProvidersService } from '../ai-providers/ai-providers.service';

export function lexicalScore(query: string, title: string, content: string): { score: number; reasons: string[] } {
  const normalizedQuery = query.trim().toLowerCase();
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const normalizedTitle = title.toLowerCase();
  const normalizedContent = content.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  if (normalizedTitle.includes(normalizedQuery)) { score += 1; reasons.push('标题精确匹配'); }
  if (normalizedContent.includes(normalizedQuery)) { score += 0.8; reasons.push('正文精确匹配'); }
  const matchedTokens = tokens.filter((token) => normalizedTitle.includes(token) || normalizedContent.includes(token));
  if (matchedTokens.length) { score += matchedTokens.length / Math.max(tokens.length, 1) * 0.5; reasons.push('关键词匹配'); }
  return { score, reasons };
}

function cosine(left: number[], right: number[]) {
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const l = left[index] ?? 0; const r = right[index] ?? 0;
    dot += l * r; leftNorm += l * l; rightNorm += r * r;
  }
  return dot / ((Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) || 1);
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService, private readonly providers: AiProvidersService) {}

  async query(
    workspaceId: string,
    userId: string,
    query: string,
    options: { folderId?: string; tagId?: string; noteId?: string; limit: number; credentials: TemporaryCredentialInput[] }
  ) {
    await this.providers.validateCredentials(userId, options.credentials);
    const config = await this.providers.selectConfiguration(userId, null, 'embedding').catch(() => null);
    const hasCredential = !config || config.provider === 'OLLAMA' || options.credentials.some((item) => item.configId === config.id && item.apiKey);
    const hits = await this.search(workspaceId, userId, query, options, options.credentials);
    return {
      hits,
      mode: hasCredential ? 'HYBRID' : 'LEXICAL',
      credentialRequired: Boolean(config && !hasCredential)
    };
  }

  async search(
    workspaceId: string,
    userId: string,
    query: string,
    options: { folderId?: string; tagId?: string; noteId?: string; limit: number },
    credentials: TemporaryCredentialInput[] = []
  ): Promise<SearchHit[]> {
    let queryVector: number[] | undefined; let embeddingProvider = '';
    try {
      const resolved = await this.providers.resolve(userId, null, 'embedding', credentials);
      const [rawVector] = await resolved.gateway.embed([query]);
      queryVector = rawVector ? normalizeVectorDimensions(rawVector) : undefined;
      embeddingProvider = resolved.gateway.provider;
    } catch {
      // 未配置嵌入模型时继续执行全文和关键词检索。
    }
    if (queryVector?.length) {
      try {
        const vector = vectorLiteral(queryVector);
        const pattern = `%${query.toLowerCase()}%`;
        const filters: Prisma.Sql[] = [
          Prisma.sql`c."workspaceId" = ${workspaceId}`,
          Prisma.sql`n."deletedAt" IS NULL`,
          Prisma.sql`n."aiEnabled" = true`,
          Prisma.sql`c."embedding" IS NOT NULL`
        ];
        if (options.noteId) filters.push(Prisma.sql`n."id" = ${options.noteId}`);
        if (options.folderId) filters.push(Prisma.sql`n."folderId" = ${options.folderId}`);
        if (options.tagId) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "NoteTag" nt WHERE nt."noteId" = n."id" AND nt."tagId" = ${options.tagId})`);
        const rows = await this.prisma.$queryRaw<Array<{ noteId: string; blockId: string; noteTitle: string; excerpt: string; updatedAt: Date; semanticScore: number; keywordScore: number; score: number }>>(Prisma.sql`
          SELECT c."noteId" AS "noteId", c."blockId" AS "blockId", n."title" AS "noteTitle",
            c."content" AS "excerpt", n."updatedAt" AS "updatedAt",
            COALESCE(1 - (c."embedding" <=> ${vector}::vector), 0)::float AS "semanticScore",
            (CASE WHEN lower(n."title") LIKE ${pattern} THEN 1 ELSE 0 END +
             CASE WHEN lower(c."content") LIKE ${pattern} THEN 0.8 ELSE 0 END)::float AS "keywordScore",
            (COALESCE(1 - (c."embedding" <=> ${vector}::vector), 0) * 0.55 +
             (CASE WHEN lower(n."title") LIKE ${pattern} THEN 1 ELSE 0 END +
              CASE WHEN lower(c."content") LIKE ${pattern} THEN 0.8 ELSE 0 END) * 0.45)::float AS "score"
          FROM "ContentChunk" c
          JOIN "Note" n ON n."id" = c."noteId"
          WHERE ${Prisma.join(filters, ' AND ')}
          ORDER BY "score" DESC, n."updatedAt" DESC
          LIMIT ${options.limit}
        `);
        if (rows.length) return rows.filter((row) => row.score > 0.01).map((row) => ({
          noteId: row.noteId, blockId: row.blockId, noteTitle: row.noteTitle, excerpt: row.excerpt.slice(0, 500),
          updatedAt: row.updatedAt.toISOString(), score: row.score,
          reasons: [...(row.keywordScore > 0 ? ['关键词匹配'] : []), ...(row.semanticScore > 0.12 ? ['语义相关'] : [])]
        }));
      } catch {
        // 数据迁移期间或 pgvector 暂不可用时，回退到块级检索，保证笔记仍可搜索。
      }
    }
    const blocks = await this.prisma.noteBlock.findMany({
      where: {
        workspaceId,
        ...(options.noteId ? { noteId: options.noteId } : {}),
        note: {
          deletedAt: null,
          aiEnabled: true,
          ...(options.folderId ? { folderId: options.folderId } : {}),
          ...(options.tagId ? { tags: { some: { tagId: options.tagId } } } : {})
        }
      },
      include: { note: { select: { id: true, title: true, updatedAt: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 500
    });
    if (!blocks.length) return [];
    let vectors: number[][] = [];
    if (embeddingProvider === 'MOCK') {
      const resolved = await this.providers.resolve(userId, null, 'embedding', credentials);
      vectors = (await resolved.gateway.embed(blocks.map((block) => `${block.note.title}\n${block.plainText}`))).map((vector) => normalizeVectorDimensions(vector));
    }
    return blocks.map((block, index) => {
      const lexical = lexicalScore(query, block.note.title, block.plainText);
      const semantic = cosine(queryVector ?? [], vectors[index] ?? []);
      const reasons = [...lexical.reasons];
      if (semantic > 0.12) reasons.push('语义相关');
      return {
        noteId: block.noteId,
        blockId: block.id,
        noteTitle: block.note.title,
        excerpt: block.plainText.slice(0, 500),
        updatedAt: block.note.updatedAt.toISOString(),
        score: lexical.score * 0.65 + semantic * 0.35,
        reasons
      };
    }).filter((hit) => hit.score > 0.01).sort((a, b) => b.score - a.score).slice(0, options.limit);
  }
}
