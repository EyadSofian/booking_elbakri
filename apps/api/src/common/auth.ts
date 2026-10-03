import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@elbakri/shared';

export const PUBLIC_KEY = 'is_public';
export const ROLES_KEY = 'allowed_roles';
export const FLAG_KEY = 'allowed_flag';

/** Reachable without signing in. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Only these roles may call the endpoint. ADMIN is always allowed, so it never
 * needs listing. Endpoints without @Roles are open to every signed-in user.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Per-person switches that open an area beyond the person's role. */
export type AccessFlag = 'visaAccess';

/**
 * Also lets in anyone with this switch turned on, whatever their role — e.g. a
 * salesperson given access to Visas. Used together with @Roles.
 */
export const OrFlag = (flag: AccessFlag) => SetMetadata(FLAG_KEY, flag);

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** A sales supervisor: sees every salesperson's sales. */
  seesAllSales: boolean;
  /** A salesperson who may also work in Visas. */
  visaAccess: boolean;
  sessionId: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
