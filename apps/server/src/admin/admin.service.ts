import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}
  async overview() {
    const [users, workspaces, notes, pendingJobs, failedJobs, usage] = await Promise.all([
      this.prisma.user.count(), this.prisma.workspace.count(), this.prisma.note.count({ where: { deletedAt: null } }),
      this.prisma.aiJob.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }), this.prisma.aiJob.count({ where: { status: 'FAILED' } }),
      this.prisma.aiUsage.aggregate({ _sum: { inputTokens: true, outputTokens: true, estimatedCny: true } })
    ]);
    return { users, workspaces, notes, jobs: { pending: pendingJobs, failed: failedJobs }, usage: usage._sum };
  }
  jobs() { return this.prisma.aiJob.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }); }
}
