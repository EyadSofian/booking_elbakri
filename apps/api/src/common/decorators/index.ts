import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Permission } from '@elbakri/shared';

export const PERMISSIONS_KEY = 'required_permissions';
export const PUBLIC_KEY = 'is_public';
export const ALLOW_API_KEY = 'allow_api_key';

/**
 * Declare the permissions an endpoint needs. Enforced by PermissionsGuard on
 * the server — the frontend's own guards only affect what is displayed.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  applyDecorators(SetMetadata(PERMISSIONS_KEY, permissions), ApiBearerAuth());

/** Marks an endpoint as reachable without authentication. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Allows a scoped API key, in addition to a user token, to reach an endpoint. */
export const AllowApiKey = () => SetMetadata(ALLOW_API_KEY, true);

export interface AuthenticatedActor {
  kind: 'USER' | 'API_KEY';
  id: string;
  email?: string;
  fullName?: string;
  locale?: string;
  permissions: string[];
  roleKeys: string[];
  sessionId?: string;
  apiKeyName?: string;
}

/** Injects the resolved actor (user or API key) into a handler parameter. */
export const CurrentActor = createParamDecorator(
  (data: keyof AuthenticatedActor | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const actor = request.actor as AuthenticatedActor | undefined;
    return data && actor ? actor[data] : actor;
  },
);

/** Injects the per-request correlation id. */
export const RequestId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().requestId as string;
});
