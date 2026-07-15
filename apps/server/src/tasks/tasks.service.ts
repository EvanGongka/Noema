import { Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import type { taskSchema } from '@ai-note/schemas';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}
  list(workspaceId: string) { return this.prisma.task.findMany({ where: { workspaceId }, include: { sourceNote: { select: { title: true } } }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }] }); }
  async create(workspaceId: string, input: z.infer<typeof taskSchema>) {
    const note = await this.prisma.note.findFirst({ where: { id: input.sourceNoteId, workspaceId, deletedAt: null } });
    if (!note) throw new NotFoundException('来源笔记不存在');
    if (input.sourceBlockId && !(await this.prisma.noteBlock.findFirst({ where: { id: input.sourceBlockId, noteId: note.id, workspaceId } }))) throw new NotFoundException('来源内容块不存在');
    return this.prisma.task.create({ data: { workspaceId, sourceNoteId: input.sourceNoteId, sourceBlockId: input.sourceBlockId, title: input.title, dueAt: input.dueAt ? new Date(input.dueAt) : null } });
  }
  async update(workspaceId: string, id: string, status: 'TODO' | 'DOING' | 'DONE') {
    const result = await this.prisma.task.updateMany({ where: { id, workspaceId }, data: { status } });
    if (!result.count) throw new NotFoundException('任务不存在');
    return this.prisma.task.findUnique({ where: { id } });
  }
}
