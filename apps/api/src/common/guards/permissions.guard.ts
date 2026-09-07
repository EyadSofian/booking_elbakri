import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@elbakri/shared';
import { ForbiddenError } from '../errors';
import { PERMISSIONS_KEY, PUBLIC_KEY, type AuthenticatedActor } from '../decorators';

/**
 * Enforces the permissions declared by @RequirePermissions.
 *
 * This is the authoritative access check. The web app hides controls the user
 * cannot use, but hiding a button is a convenience — this guard is the rule.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const actor = request.actor as AuthenticatedActor | undefined;
    if (!actor) throw new ForbiddenError('Authentication is required.');

    const held = new Set(actor.permissions);
    const missing = required.filter((p) => !held.has(p));
    if (missing.length > 0) {
      throw new ForbiddenError('You do not have permission to perform this action.', {
        required,
        missing,
      });
    }
    return true;
  }
}
