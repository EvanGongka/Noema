import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface AnalysisOutput {
  title?: string;
  summary?: string;
  keyPoints?: string[];
  tags?: string[];
  topics?: string[];
  questions?: string[];
  tasks?: Array<{ title: string; dueAt?: string | null }>;
  review?: 'APPLIED' | 'DISMISSED';
}

function asOutput(value: Prisma.JsonValue | null): AnalysisOutput {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnalysisOutput : {};
}

@Injectable()
export class AiSuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string, noteId?: string) {
    const jobs = await this.prisma.aiJob.findMany({
      where: { workspaceId, type: 'ANALYZE_NOTE', status: 'COMPLETED', ...(noteId ? { noteId } : {}) },
      orderBy: { updatedAt: 'desc' }, take: 50
    });
    return jobs.map((job) => ({ ...job, output: asOutput(job.output) })).filter((job) => !job.output.review);
  }

  async apply(workspaceId: string, userId: string, jobId: string, fields: Array<'title' | 'summary' | 'tags' | 'tasks'>) {
    const job = await this.prisma.aiJob.findFirst({ where: { id: jobId, workspaceId, status: 'COMPLETED' } });
    if (!job?.noteId) throw new NotFoundException('AI 建议不存在');
    if (!fields.length) throw new BadRequestException('至少选择一项建议');
    const output = asOutput(job.output);
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.note.findFirst({ where: { id: job.noteId!, workspaceId, deletedAt: null } });
      if (!note) throw new NotFoundException('笔记不存在');
      await tx.note.update({ where: { id: note.id }, data: {
        ...(fields.includes('title') && output.title ? { title: output.title } : {}),
        ...(fields.includes('summary') && output.summary ? { summary: output.summary } : {}),
        version: { increment: 1 }
      } });
      if (fields.includes('tags')) {
        for (const name of (output.tags ?? []).slice(0, 8)) {
          const tag = await tx.tag.upsert({ where: { workspaceId_name: { workspaceId, name } }, update: {}, create: { workspaceId, name } });
          await tx.noteTag.upsert({ where: { noteId_tagId: { noteId: note.id, tagId: tag.id } }, update: {}, create: { noteId: note.id, tagId: tag.id } });
        }
      }
      if (fields.includes('tasks')) {
        const sourceBlock = await tx.noteBlock.findFirst({ where: { noteId: note.id, workspaceId }, orderBy: { position: 'asc' } });
        for (const task of (output.tasks ?? []).slice(0, 20)) {
          await tx.task.create({ data: { workspaceId, sourceNoteId: note.id, sourceBlockId: sourceBlock?.id, title: task.title, dueAt: task.dueAt ? new Date(task.dueAt) : null } });
        }
      }
      await tx.aiJob.update({ where: { id: job.id }, data: { output: { ...output, review: 'APPLIED', appliedFields: fields } as Prisma.InputJsonValue } });
      await tx.auditLog.create({ data: { workspaceId, userId, action: 'AI_SUGGESTION_APPLIED', targetType: 'AI_JOB', targetId: job.id, metadata: { fields } } });
      return { ok: true };
    });
  }

  async dismiss(workspaceId: string, userId: string, jobId: string) {
    const job = await this.prisma.aiJob.findFirst({ where: { id: jobId, workspaceId, status: 'COMPLETED' } });
    if (!job) throw new NotFoundException('AI 建议不存在');
    const output = asOutput(job.output);
    await this.prisma.$transaction([
      this.prisma.aiJob.update({ where: { id: job.id }, data: { output: { ...output, review: 'DISMISSED' } as Prisma.InputJsonValue } }),
      this.prisma.auditLog.create({ data: { workspaceId, userId, action: 'AI_SUGGESTION_DISMISSED', targetType: 'AI_JOB', targetId: job.id } })
    ]);
    return { ok: true };
  }

  async usage(workspaceId: string) {
    const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
    const [totals, recent] = await Promise.all([
      this.prisma.aiUsage.aggregate({ where: { workspaceId, createdAt: { gte: start } }, _sum: { inputTokens: true, outputTokens: true, estimatedCny: true }, _count: true }),
      this.prisma.aiUsage.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 20 })
    ]);
    return { periodStart: start.toISOString(), calls: totals._count, totals: totals._sum, recent };
  }
}
