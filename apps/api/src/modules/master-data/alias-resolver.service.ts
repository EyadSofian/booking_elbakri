import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  AliasStatus, MatchConfidence, normalizeAliasKey, resolveAlias,
  type AliasResolution, type MasterRecord,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';

export type AliasEntityType =
  | 'PARTNER' | 'HOTEL' | 'ROOM_TYPE' | 'MEAL_PLAN'
  | 'LOCATION' | 'EXCURSION' | 'NATIONALITY';

export interface ResolvedReference {
  /** Master record id, or null when the value could not be resolved safely. */
  id: string | null;
  /** The original text, always kept so nothing is lost. */
  raw: string | null;
  resolution: AliasResolution;
}

/**
 * Resolves free-text legacy values (hotel names, agencies, meal plans…) to
 * master records via canonical names and approved aliases.
 *
 * A fuzzy similarity hit is recorded as a *suggestion* for review and never
 * applied automatically: silently merging "SAMA" into "SAMA TOURS" would erase
 * a distinction that may turn out to matter.
 */
@Injectable()
export class AliasResolverService {
  /** Master records cached per resolution pass, keyed by entity type. */
  private cache = new Map<AliasEntityType, MasterRecord[]>();

  constructor(private readonly prisma: PrismaService) {}

  /** Drops the cache. Call at the start of an import run. */
  resetCache(): void {
    this.cache.clear();
  }

  async loadMasters(type: AliasEntityType, tx?: Prisma.TransactionClient): Promise<MasterRecord[]> {
    const cached = this.cache.get(type);
    if (cached) return cached;

    const client = tx ?? this.prisma;
    let records: MasterRecord[] = [];

    switch (type) {
      case 'PARTNER': {
        const rows = await client.partner.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true, normalizedName: true, aliases: { select: { aliasKey: true, status: true } } },
        });
        records = rows.map((r) => ({
          id: r.id, name: r.name, normalizedName: r.normalizedName,
          aliasKeys: r.aliases.filter((a) => a.status === AliasStatus.APPROVED).map((a) => a.aliasKey),
        }));
        break;
      }
      case 'HOTEL': {
        const rows = await client.hotel.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true, normalizedName: true, aliases: { select: { aliasKey: true, status: true } } },
        });
        records = rows.map((r) => ({
          id: r.id, name: r.name, normalizedName: r.normalizedName,
          aliasKeys: r.aliases.filter((a) => a.status === AliasStatus.APPROVED).map((a) => a.aliasKey),
        }));
        break;
      }
      case 'ROOM_TYPE': {
        const rows = await client.roomType.findMany({
          select: { id: true, name: true, normalizedName: true, aliases: { select: { aliasKey: true, status: true } } },
        });
        records = rows.map((r) => ({
          id: r.id, name: r.name, normalizedName: r.normalizedName,
          aliasKeys: r.aliases.filter((a) => a.status === AliasStatus.APPROVED).map((a) => a.aliasKey),
        }));
        break;
      }
      case 'MEAL_PLAN': {
        const rows = await client.mealPlan.findMany({
          select: { id: true, name: true, normalizedName: true, aliases: { select: { aliasKey: true, status: true } } },
        });
        records = rows.map((r) => ({
          id: r.id, name: r.name, normalizedName: r.normalizedName,
          aliasKeys: r.aliases.filter((a) => a.status === AliasStatus.APPROVED).map((a) => a.aliasKey),
        }));
        break;
      }
      case 'LOCATION': {
        const rows = await client.location.findMany({
          select: { id: true, name: true, normalizedName: true, aliases: { select: { aliasKey: true, status: true } } },
        });
        records = rows.map((r) => ({
          id: r.id, name: r.name, normalizedName: r.normalizedName,
          aliasKeys: r.aliases.filter((a) => a.status === AliasStatus.APPROVED).map((a) => a.aliasKey),
        }));
        break;
      }
      case 'EXCURSION': {
        const rows = await client.excursionCatalogItem.findMany({
          select: { id: true, name: true, normalizedName: true, aliases: { select: { aliasKey: true, status: true } } },
        });
        records = rows.map((r) => ({
          id: r.id, name: r.name, normalizedName: r.normalizedName,
          aliasKeys: r.aliases.filter((a) => a.status === AliasStatus.APPROVED).map((a) => a.aliasKey),
        }));
        break;
      }
      case 'NATIONALITY': {
        const rows = await client.nationality.findMany({
          select: { id: true, name: true, normalizedName: true, aliases: { select: { aliasKey: true, status: true } } },
        });
        records = rows.map((r) => ({
          id: r.id, name: r.name, normalizedName: r.normalizedName,
          aliasKeys: r.aliases.filter((a) => a.status === AliasStatus.APPROVED).map((a) => a.aliasKey),
        }));
        break;
      }
    }

    this.cache.set(type, records);
    return records;
  }

  /**
   * Resolve one value. `id` is populated only for a deterministic match; a
   * fuzzy candidate comes back in `resolution.suggestions` for a human.
   */
  async resolve(
    type: AliasEntityType,
    value: string | null | undefined,
    tx?: Prisma.TransactionClient,
  ): Promise<ResolvedReference> {
    const masters = await this.loadMasters(type, tx);
    const resolution = resolveAlias(value, masters);
    return { id: resolution.match?.id ?? null, raw: value ?? null, resolution };
  }

  /**
   * Records an unresolved or uncertain value so it appears in the review queue.
   * Repeated occurrences increment a counter rather than creating duplicates.
   */
  async recordSuggestion(
    type: AliasEntityType,
    rawValue: string,
    resolution: AliasResolution,
    importRunId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const aliasKey = normalizeAliasKey(rawValue);
    if (!aliasKey) return;

    const top = resolution.suggestions[0];
    await client.aliasMapping.upsert({
      where: { entityType_aliasKey: { entityType: type, aliasKey } },
      create: {
        entityType: type,
        rawValue,
        aliasKey,
        suggestedId: top?.record.id ?? null,
        suggestedName: top?.record.name ?? null,
        score: top?.score ?? null,
        status: AliasStatus.SUGGESTED,
        importRunId,
        occurrences: 1,
      },
      update: { occurrences: { increment: 1 } },
    });
  }

  /**
   * Approves a suggestion: creates the alias row on the chosen master record so
   * the value resolves deterministically from now on.
   */
  async approve(
    mappingId: string,
    targetId: string,
    approvedBy: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const mapping = await client.aliasMapping.findUniqueOrThrow({ where: { id: mappingId } });
    const now = new Date();
    const data = {
      alias: mapping.rawValue,
      aliasKey: mapping.aliasKey,
      status: AliasStatus.APPROVED,
    };

    switch (mapping.entityType as AliasEntityType) {
      case 'PARTNER':
        await client.partnerAlias.upsert({
          where: { aliasKey_partnerId: { aliasKey: mapping.aliasKey, partnerId: targetId } },
          create: { ...data, partnerId: targetId, source: 'IMPORT_REVIEW', approvedBy, approvedAt: now },
          update: { status: AliasStatus.APPROVED, approvedBy, approvedAt: now },
        });
        break;
      case 'HOTEL':
        await client.hotelAlias.upsert({
          where: { aliasKey_hotelId: { aliasKey: mapping.aliasKey, hotelId: targetId } },
          create: { ...data, hotelId: targetId, source: 'IMPORT_REVIEW', approvedBy, approvedAt: now },
          update: { status: AliasStatus.APPROVED, approvedBy, approvedAt: now },
        });
        break;
      case 'ROOM_TYPE':
        await client.roomTypeAlias.upsert({
          where: { aliasKey_roomTypeId: { aliasKey: mapping.aliasKey, roomTypeId: targetId } },
          create: { ...data, roomTypeId: targetId },
          update: { status: AliasStatus.APPROVED },
        });
        break;
      case 'MEAL_PLAN':
        await client.mealPlanAlias.upsert({
          where: { aliasKey_mealPlanId: { aliasKey: mapping.aliasKey, mealPlanId: targetId } },
          create: { ...data, mealPlanId: targetId },
          update: { status: AliasStatus.APPROVED },
        });
        break;
      case 'LOCATION':
        await client.locationAlias.upsert({
          where: { aliasKey_locationId: { aliasKey: mapping.aliasKey, locationId: targetId } },
          create: { ...data, locationId: targetId },
          update: { status: AliasStatus.APPROVED },
        });
        break;
      case 'EXCURSION':
        await client.excursionAlias.upsert({
          where: { aliasKey_catalogItemId: { aliasKey: mapping.aliasKey, catalogItemId: targetId } },
          create: { ...data, catalogItemId: targetId },
          update: { status: AliasStatus.APPROVED },
        });
        break;
      case 'NATIONALITY':
        await client.nationalityAlias.upsert({
          where: { aliasKey_nationalityId: { aliasKey: mapping.aliasKey, nationalityId: targetId } },
          create: { ...data, nationalityId: targetId },
          update: { status: AliasStatus.APPROVED },
        });
        break;
    }

    await client.aliasMapping.update({
      where: { id: mappingId },
      data: { status: AliasStatus.APPROVED, resolvedId: targetId, resolvedBy: approvedBy, resolvedAt: now },
    });
    this.resetCache();
  }

  /** True when the resolution is decisive enough to store a foreign key. */
  static isDeterministic(resolution: AliasResolution): boolean {
    return resolution.confidence === MatchConfidence.EXACT && resolution.match !== null;
  }
}
