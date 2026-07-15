import { config } from 'dotenv';
import { createModelGateway, vectorLiteral } from '@ai-note/ai-core';
import { Prisma, PrismaClient, type AiJob } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import { splitText } from './chunk';

config({ path: process.env.ENV_FILE ?? '../../.env' });

const prisma = new PrismaClient();
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), username: redisUrl.username || undefined, password: redisUrl.password || undefined, db: Number(redisUrl.pathname.slice(1) || 0) };
const queue = new Queue('ai-jobs', { connection });

function resolveGateways(_job: AiJob) {
  const analysisGateway = createModelGateway();
  const embeddingGateway = analysisGateway;
  return { analysisGateway, embeddingGateway, providerConfigId: null };
}

async function processAnalysis(jobId: string) {
  const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === 'COMPLETED') return;
  try {
    const { analysisGateway, embeddingGateway, providerConfigId } = resolveGateways(job);
    await prisma.aiJob.update({ where: { id: jobId }, data: { status: 'PROCESSING', attempts: { increment: 1 }, error: null, providerConfigId } });
    const note = job.noteId ? await prisma.note.findFirst({ where: { id: job.noteId, workspaceId: job.workspaceId, deletedAt: null, aiEnabled: true }, include: { blocks: { orderBy: { position: 'asc' } } } }) : null;
    if (!note) throw new Error('笔记不存在或已禁止 AI 处理');
    const analysis = await analysisGateway.analyze(note.plainText);
    const chunkRecords = note.blocks.flatMap((block) => splitText(block.plainText).map((content, index) => ({ block, content, index })));
    const vectors = embeddingGateway ? await embeddingGateway.embed(chunkRecords.map((item) => item.content)).catch(() => []) : [];
    await prisma.$transaction(async (tx) => {
      await tx.contentChunk.deleteMany({ where: { noteId: note.id } });
      for (let index = 0; index < chunkRecords.length; index += 1) {
        const item = chunkRecords[index];
        if (!item) continue;
        const created = await tx.contentChunk.create({ data: { workspaceId: note.workspaceId, noteId: note.id, blockId: item.block.id, position: item.index, content: item.content } });
        const vector = vectors[index];
        if (vector?.length) await tx.$executeRawUnsafe('UPDATE "ContentChunk" SET "embedding" = $1::vector WHERE "id" = $2', vectorLiteral(vector), created.id);
      }
      await tx.aiUsage.create({ data: { workspaceId: note.workspaceId, kind: 'ANALYSIS', model: analysisGateway.model, inputTokens: note.plainText.length, outputTokens: analysis.summary.length } });
      await tx.aiJob.update({ where: { id: jobId }, data: { status: 'COMPLETED', model: analysisGateway.model, output: analysis as unknown as Prisma.InputJsonValue } });
    });
    await refreshRelations(note.workspaceId, note.id, note.plainText);
  } catch (error) {
    await prisma.aiJob.update({ where: { id: jobId }, data: { status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 1000) : '未知错误' } });
    throw error;
  }
}

async function refreshRelations(workspaceId: string, noteId: string, text: string) {
  const terms = new Set(text.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length >= 2));
  const candidates = await prisma.note.findMany({ where: { workspaceId, id: { not: noteId }, deletedAt: null, aiEnabled: true }, select: { id: true, plainText: true }, take: 200 });
  await prisma.noteRelation.deleteMany({ where: { fromNoteId: noteId, type: 'RELATED' } });
  for (const candidate of candidates) {
    const other = new Set(candidate.plainText.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length >= 2));
    const overlap = [...terms].filter((term) => other.has(term)).length;
    const score = overlap / Math.max(Math.min(terms.size, other.size), 1);
    if (score >= 0.15) await prisma.noteRelation.create({ data: { fromNoteId: noteId, toNoteId: candidate.id, type: 'RELATED', score } });
  }
}

const worker = new Worker('ai-jobs', async (bullJob) => processAnalysis(String(bullJob.data.jobId)), { connection, concurrency: Number(process.env.AI_WORKER_CONCURRENCY ?? 2) });

async function dispatchPending() {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
  await prisma.aiJob.updateMany({ where: { status: 'PROCESSING', updatedAt: { lt: staleBefore }, attempts: { lt: 3 } }, data: { status: 'FAILED', error: '作业处理超时，等待自动重试' } });
  const pending = await prisma.aiJob.findMany({ where: { status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: 3 } }, orderBy: { createdAt: 'asc' }, take: 50 });
  for (const job of pending) await queue.add('analyze-note', { jobId: job.id }, { jobId: job.id, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: 500 });
}

const timer = setInterval(() => void dispatchPending(), 5000);
void dispatchPending();

async function shutdown() {
  clearInterval(timer);
  await worker.close(); await queue.close(); await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
