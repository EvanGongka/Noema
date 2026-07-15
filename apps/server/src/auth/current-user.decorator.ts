import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthRequest } from './auth.types';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<AuthRequest>().auth;
});
