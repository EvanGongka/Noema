export type NoteStatus = 'INBOX' | 'ACTIVE' | 'ARCHIVED';
export type AiJobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Citation {
  noteId: string;
  blockId: string;
  noteTitle: string;
  excerpt: string;
  updatedAt: string;
}

export interface SearchHit extends Citation {
  score: number;
  reasons: string[];
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export const API_VERSION = 'v1';
