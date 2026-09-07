'use client';

import { MatchingQueue } from '../matching-queue';
import type { ImportTabContext } from '../types';

/** Unresolved values from this run, and the decisions that resolve them. */
export function ImportMatchingTab({ context }: { context: ImportTabContext }) {
  return <MatchingQueue importRunId={context.runId} />;
}
