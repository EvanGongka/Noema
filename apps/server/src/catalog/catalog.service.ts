import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}
  folders(workspaceId: string) { return this.prisma.folder.findMany({ where: { workspaceId }, orderBy: { name: 'asc' } }); }
  tags(workspaceId: string) { return this.prisma.tag.findMany({ where: { workspaceId }, orderBy: { name: 'asc' } }); }
  createFolder(workspaceId: string, name: string, parentId?: string | null) { return this.prisma.folder.create({ data: { workspaceId, name, parentId } }); }
  createTag(workspaceId: string, name: string, color: string) { return this.prisma.tag.upsert({ where: { workspaceId_name: { workspaceId, name } }, update: { color }, create: { workspaceId, name, color } }); }
}
