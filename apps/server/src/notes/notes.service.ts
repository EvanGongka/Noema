import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NoteInput, NotePatchInput } from '@ai-note/schemas';
import { PrismaService } from '../prisma/prisma.service';
import { extractBlocks } from './note-content';

const noteInclude = { folder: true, tags: { include: { tag: true } }, blocks: { orderBy: { position: 'asc' as const } } };

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string, status?: 'INBOX' | 'ACTIVE' | 'ARCHIVED') {
    return this.prisma.note.findMany({ where: { workspaceId, deletedAt: null, ...(status ? { status } : {}) }, include: noteInclude, orderBy: { updatedAt: 'desc' } });
  }

  async get(workspaceId: string, id: string) {
    const note = await this.prisma.note.findFirst({ where: { id, workspaceId, deletedAt: null }, include: { ...noteInclude, versions: { orderBy: { version: 'desc' }, take: 20 }, sources: true, assets: true } });
    if (!note) throw new NotFoundException('笔记不存在');
    return note;
  }

  async create(workspaceId: string, userId: string, input: NoteInput) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertReferences(tx, workspaceId, input.folderId, input.tagIds);
      const note = await tx.note.create({ data: {
        workspaceId, title: input.title, content: input.content as Prisma.InputJsonValue, plainText: input.plainText,
        folderId: input.folderId, status: input.status, aiEnabled: input.aiEnabled,
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
        sources: { create: { type: 'USER' } }
      } });
      await tx.noteBlock.createMany({ data: extractBlocks(input.content, input.plainText).map((block, position) => ({ workspaceId, noteId: note.id, position, type: block.type, content: block.content as Prisma.InputJsonValue, plainText: block.plainText })) });
      await tx.auditLog.create({ data: { workspaceId, userId, action: 'NOTE_CREATED', targetType: 'NOTE', targetId: note.id } });
      await this.scheduleAnalysis(tx, workspaceId, userId, note.id, note.version, input.aiEnabled);
      return note;
    });
  }

  async update(workspaceId: string, userId: string, id: string, input: NotePatchInput) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.note.findFirst({ where: { id, workspaceId, deletedAt: null } });
      if (!current) throw new NotFoundException('笔记不存在');
      if (current.version !== input.version) throw new ConflictException('笔记已在其他位置更新，请刷新后重试');
      await this.assertReferences(tx, workspaceId, input.folderId, input.tagIds);
      await tx.noteVersion.create({ data: { noteId: id, version: current.version, title: current.title, content: current.content as Prisma.InputJsonValue, plainText: current.plainText } });
      if (input.tagIds) {
        await tx.noteTag.deleteMany({ where: { noteId: id } });
        await tx.noteTag.createMany({ data: input.tagIds.map((tagId) => ({ noteId: id, tagId })) });
      }
      const updated = await tx.note.update({ where: { id }, data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content as Prisma.InputJsonValue } : {}),
        ...(input.plainText !== undefined ? { plainText: input.plainText } : {}),
        ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.aiEnabled !== undefined ? { aiEnabled: input.aiEnabled } : {}),
        version: { increment: 1 }
      } });
      if (input.content !== undefined || input.plainText !== undefined) {
        const blocks = extractBlocks(input.content ?? current.content, input.plainText ?? current.plainText);
        const existingBlocks = await tx.noteBlock.findMany({ where: { noteId: id }, orderBy: { position: 'asc' } });
        for (let position = 0; position < blocks.length; position += 1) {
          const block = blocks[position]; const existing = existingBlocks[position];
          if (!block) continue;
          if (existing) await tx.noteBlock.update({ where: { id: existing.id }, data: { position, type: block.type, content: block.content as Prisma.InputJsonValue, plainText: block.plainText } });
          else await tx.noteBlock.create({ data: { workspaceId, noteId: id, position, type: block.type, content: block.content as Prisma.InputJsonValue, plainText: block.plainText } });
        }
        const obsoleteIds = existingBlocks.slice(blocks.length).map((block) => block.id);
        if (obsoleteIds.length) await tx.noteBlock.deleteMany({ where: { id: { in: obsoleteIds } } });
      }
      await tx.auditLog.create({ data: { workspaceId, userId, action: 'NOTE_UPDATED', targetType: 'NOTE', targetId: id } });
      await this.scheduleAnalysis(tx, workspaceId, userId, id, updated.version, updated.aiEnabled);
      return updated;
    });
  }

  async remove(workspaceId: string, userId: string, id: string) {
    const result = await this.prisma.note.updateMany({ where: { id, workspaceId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!result.count) throw new NotFoundException('笔记不存在');
    await this.prisma.auditLog.create({ data: { workspaceId, userId, action: 'NOTE_DELETED', targetType: 'NOTE', targetId: id } });
  }

  related(workspaceId: string, noteId: string) {
    return this.prisma.noteRelation.findMany({ where: { fromNoteId: noteId, fromNote: { workspaceId } }, include: { toNote: { select: { id: true, title: true, summary: true, updatedAt: true } } }, orderBy: { score: 'desc' }, take: 10 });
  }

  private async assertReferences(tx: Prisma.TransactionClient, workspaceId: string, folderId?: string | null, tagIds?: string[]) {
    if (folderId && !(await tx.folder.findFirst({ where: { id: folderId, workspaceId } }))) throw new NotFoundException('文件夹不存在');
    if (tagIds?.length) {
      const count = await tx.tag.count({ where: { id: { in: tagIds }, workspaceId } });
      if (count !== new Set(tagIds).size) throw new NotFoundException('标签不存在');
    }
  }

  private async scheduleAnalysis(tx: Prisma.TransactionClient, workspaceId: string, userId: string, noteId: string, version: number, enabled: boolean) {
    if (!enabled) return;
    const dedupeKey = `ANALYZE_NOTE:${noteId}:${version}`;
    await tx.aiJob.upsert({ where: { dedupeKey }, update: {}, create: { workspaceId, noteId, requestedByUserId: userId, type: 'ANALYZE_NOTE', status: 'WAITING_CONFIGURATION', dedupeKey, input: { noteId, version } } });
  }
}
