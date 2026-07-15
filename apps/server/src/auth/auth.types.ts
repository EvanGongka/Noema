import type { Request } from 'express';

export interface AuthContext {
  sessionId: string;
  userId: string;
  workspaceId: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export interface AuthRequest extends Request {
  auth: AuthContext;
}
