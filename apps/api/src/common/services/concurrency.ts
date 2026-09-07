import { StaleRecordError } from '../errors';

/**
 * Optimistic concurrency check.
 *
 * When a client supplies the version it read, a mismatch means someone else
 * saved first. The write is rejected with a clear conflict so the two edits are
 * reconciled deliberately, rather than one silently overwriting the other.
 */
export function assertVersion(
  entity: string,
  expected: number | undefined,
  actual: number,
): void {
  if (expected === undefined) return;
  if (expected !== actual) throw new StaleRecordError(entity, expected, actual);
}

/** Prisma `where` fragment that makes an update conditional on the version. */
export function versionedWhere<T extends Record<string, unknown>>(
  where: T,
  expected: number | undefined,
): T & { version?: number } {
  return expected === undefined ? where : { ...where, version: expected };
}
