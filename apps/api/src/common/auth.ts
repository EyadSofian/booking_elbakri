import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@elbakri/shared';

export const PUBLIC_KEY = 'is_public';
export const ROLES_KEY = 'allowed_roles';

/** Reachable without signing in. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Only these roles may call the endpoint. ADMIN is always allowed, so it never
 * needs listing. Endpoints without @Roles are open to every signed-in user.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** A sales supervisor: sees every salesperson's sales. */
  seesAllSales: boolean;
  sessionId: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
