import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { formatDocumentReference } from '@elbakri/shared';
import { PrismaService } from './prisma.service';

/**
 * Allocates human-readable references such as EB-2026-000123.
 *
 * The counter lives in the database and is incremented inside the caller's
 * transaction, so two concurrent requests can never be handed the same number.
 */
@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async next(prefix: string, tx?: Prisma.TransactionClient, year = new Date().getUTCFullYear()): Promise<string> {
    const client = tx ?? this.prisma;
    const row = await client.referenceSequence.upsert({
      where: { prefix_year: { prefix, year } },
      create: { prefix, year, current: 1 },
      update: { current: { increment: 1 } },
      select: { current: true },
    });
    return formatDocumentReference(prefix, year, row.current);
  }

  /** Allocates a contiguous block, used when an import creates many records. */
  async nextBatch(
    prefix: string,
    count: number,
    tx?: Prisma.TransactionClient,
    year = new Date().getUTCFullYear(),
  ): Promise<string[]> {
    if (count <= 0) return [];
    const client = tx ?? this.prisma;
    const row = await client.referenceSequence.upsert({
      where: { prefix_year: { prefix, year } },
      create: { prefix, year, current: count },
      update: { current: { increment: count } },
      select: { current: true },
    });
    const last = row.current;
    const first = last - count + 1;
    return Array.from({ length: count }, (_, i) => formatDocumentReference(prefix, year, first + i));
  }
}
