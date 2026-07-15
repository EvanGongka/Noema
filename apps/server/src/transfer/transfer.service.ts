import { Injectable } from "@nestjs/common";
import { type NoteInput } from "@ai-note/schemas";
import { NotesService } from "../notes/notes.service";
import { markdownDocument } from "../notes/note-content";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notes: NotesService,
  ) {}
  import(
    workspaceId: string,
    userId: string,
    filename: string,
    content: string,
  ) {
    const title =
      filename.replace(/\.(md|markdown|txt)$/i, "").slice(0, 200) || "导入笔记";
    const input: NoteInput = {
      title,
      plainText: content,
      content: markdownDocument(content),
      status: "ACTIVE",
      aiEnabled: true,
      tagIds: [],
    };
    return this.notes.create(workspaceId, userId, input);
  }
  async exportNote(
    workspaceId: string,
    noteId: string,
    format: "markdown" | "json",
  ) {
    const note = await this.notes.get(workspaceId, noteId);
    return format === "json"
      ? JSON.stringify(note, null, 2)
      : `# ${note.title}\n\n${note.plainText}\n`;
  }
  async exportWorkspace(workspaceId: string) {
    const notes = await this.prisma.note.findMany({
      where: { workspaceId, deletedAt: null },
      include: {
        blocks: true,
        tags: { include: { tag: true } },
        sources: true,
      },
    });
    return JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), notes },
      null,
      2,
    );
  }
}
