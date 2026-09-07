import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  buildPaginationMeta, matchTraveler, normalizeForSearch, parseLegacyPhone,
  type PaginatedResponse, type TravelerCandidate,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import type { ActorContext } from '../../common/services/request-context.service';

@Injectable()
export class TravelersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: {
    page: number; pageSize: number; q?: string; partnerId?: string; nationalityId?: string;
  }): Promise<PaginatedResponse<unknown>> {
    const and: Prisma.TravelerWhereInput[] = [{ deletedAt: null }];
    if (query.partnerId) and.push({ partnerId: query.partnerId });
    if (query.nationalityId) and.push({ nationalityId: query.nationalityId });
    if (query.q) {
      const norm = normalizeForSearch(query.q);
      const digits = query.q.replace(/\D/g, '');
      const or: Prisma.TravelerWhereInput[] = [{ normalizedName: { contains: norm } }];
      if (digits.length >= 4) or.push({ phoneDigits: { contains: digits } });
      and.push({ OR: or });
    }
    const where: Prisma.TravelerWhereInput = { AND: and };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.traveler.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { fullName: 'asc' },
        include: {
          nationality: { select: { id: true, code: true, name: true, nameAr: true } },
          partner: { select: { id: true, name: true } },
          _count: { select: { tripsAsLead: true, hotelBookings: true, transferBookings: true, excursionBookings: true, visaOrders: true } },
        },
      }),
      this.prisma.traveler.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  async findOne(id: string): Promise<unknown> {
    const traveler = await this.prisma.traveler.findFirst({
      where: { id, deletedAt: null },
      include: {
        nationality: true,
        partner: true,
        tripsAsLead: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, reference: true, status: true,
            travelStartDate: true, travelEndDate: true,
            partner: { select: { id: true, name: true } },
          },
        },
        importRun: { select: { id: true, sourceFilename: true } },
      },
    });
    if (!traveler) throw new NotFoundError('Traveler', id);
    return traveler;
  }

  async create(
    input: {
      fullName: string; fullNameAr?: string | null; phone?: string | null;
      email?: string | null; nationalityId?: string | null; nationalityRaw?: string | null;
      passportNumber?: string | null; partnerId?: string | null; notes?: string | null;
    },
    ctx: ActorContext,
  ): Promise<unknown> {
    if (!input.fullName?.trim()) throw new ValidationError('A traveller needs a name.');
    const phone = input.phone ? parseLegacyPhone(input.phone) : null;

    const traveler = await this.prisma.traveler.create({
      data: {
        fullName: input.fullName.trim(),
        fullNameAr: input.fullNameAr ?? null,
        normalizedName: normalizeForSearch(input.fullName),
        phoneRaw: phone?.raw ?? null,
        phoneNormalized: phone?.normalized ?? null,
        phoneDigits: phone?.digits ?? null,
        countryCallingCode: phone?.countryCallingCode ?? null,
        email: input.email ?? null,
        nationalityId: input.nationalityId ?? null,
        nationalityRaw: input.nationalityRaw ?? null,
        passportNumber: input.passportNumber ?? null,
        partnerId: input.partnerId ?? null,
        notes: input.notes ?? null,
        createdById: ctx.actorId ?? null,
      },
    });

    await this.audit.record({
      action: 'TRAVELER_CREATED', entityType: 'Traveler', entityId: traveler.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId, after: traveler,
    });
    return traveler;
  }

  async update(
    id: string,
    input: Partial<{
      fullName: string; fullNameAr: string | null; phone: string | null;
      email: string | null; nationalityId: string | null; nationalityRaw: string | null;
      passportNumber: string | null; partnerId: string | null; notes: string | null;
    }>,
    ctx: ActorContext,
  ): Promise<unknown> {
    const before = await this.prisma.traveler.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Traveler', id);

    const phone = input.phone !== undefined && input.phone !== null ? parseLegacyPhone(input.phone) : null;

    const after = await this.prisma.traveler.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined
          ? { fullName: input.fullName, normalizedName: normalizeForSearch(input.fullName) }
          : {}),
        ...(input.fullNameAr !== undefined ? { fullNameAr: input.fullNameAr } : {}),
        ...(phone
          ? {
              phoneRaw: phone.raw,
              phoneNormalized: phone.normalized,
              phoneDigits: phone.digits,
              countryCallingCode: phone.countryCallingCode,
            }
          : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.nationalityId !== undefined ? { nationalityId: input.nationalityId } : {}),
        ...(input.nationalityRaw !== undefined ? { nationalityRaw: input.nationalityRaw } : {}),
        ...(input.passportNumber !== undefined ? { passportNumber: input.passportNumber } : {}),
        ...(input.partnerId !== undefined ? { partnerId: input.partnerId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedById: ctx.actorId ?? null,
      },
    });

    const diff = this.audit.diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      action: 'TRAVELER_UPDATED', entityType: 'Traveler', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: diff.before, after: diff.after, metadata: { changedFields: diff.changedFields },
    });
    return after;
  }

  /**
   * Finds records that might be the same person.
   *
   * This only ever suggests. Two travellers are merged by an explicit decision,
   * because a wrong merge silently attaches one customer's services to another.
   */
  async findDuplicates(id: string): Promise<unknown> {
    const traveler = await this.prisma.traveler.findFirst({
      where: { id, deletedAt: null },
      include: { nationality: { select: { code: true } } },
    });
    if (!traveler) throw new NotFoundError('Traveler', id);

    const candidateRows = await this.prisma.traveler.findMany({
      where: {
        deletedAt: null,
        id: { not: id },
        OR: [
          { normalizedName: { contains: traveler.normalizedName.split(' ')[0] ?? '' } },
          ...(traveler.phoneNormalized ? [{ phoneNormalized: traveler.phoneNormalized }] : []),
        ],
      },
      take: 100,
      include: { nationality: { select: { code: true } } },
    });

    const candidates: TravelerCandidate[] = candidateRows.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      normalizedName: c.normalizedName,
      phoneNormalized: c.phoneNormalized,
      phoneDigits: c.phoneDigits,
      nationalityCode: c.nationality?.code ?? null,
      partnerId: c.partnerId,
    }));

    const matches = matchTraveler(
      {
        fullName: traveler.fullName,
        phoneNormalized: traveler.phoneNormalized,
        phoneDigits: traveler.phoneDigits,
        nationalityCode: traveler.nationality?.code ?? null,
        partnerId: traveler.partnerId,
      },
      candidates,
    );

    const byId = new Map(candidateRows.map((c) => [c.id, c]));
    return matches.map((m) => ({
      ...m,
      traveler: byId.get(m.candidateId),
    }));
  }

  /**
   * Merges a duplicate into a surviving record.
   *
   * Every service is repointed at the survivor and the duplicate is archived
   * rather than deleted, so the merge itself stays reversible and auditable.
   */
  async merge(survivorId: string, duplicateId: string, ctx: ActorContext): Promise<unknown> {
    if (survivorId === duplicateId) {
      throw new ValidationError('A traveller cannot be merged into themselves.');
    }

    const [survivor, duplicate] = await Promise.all([
      this.prisma.traveler.findFirst({ where: { id: survivorId, deletedAt: null } }),
      this.prisma.traveler.findFirst({ where: { id: duplicateId, deletedAt: null } }),
    ]);
    if (!survivor) throw new NotFoundError('Traveler', survivorId);
    if (!duplicate) throw new NotFoundError('Traveler', duplicateId);

    const result = await this.prisma.$transaction(async (tx) => {
      const moves = await Promise.all([
        tx.tripFile.updateMany({ where: { leadTravelerId: duplicateId }, data: { leadTravelerId: survivorId } }),
        tx.hotelBooking.updateMany({ where: { leadTravelerId: duplicateId }, data: { leadTravelerId: survivorId } }),
        tx.transferBooking.updateMany({ where: { leadTravelerId: duplicateId }, data: { leadTravelerId: survivorId } }),
        tx.excursionBooking.updateMany({ where: { leadTravelerId: duplicateId }, data: { leadTravelerId: survivorId } }),
        tx.visaOrder.updateMany({ where: { leadTravelerId: duplicateId }, data: { leadTravelerId: survivorId } }),
        tx.visaApplicant.updateMany({ where: { travelerId: duplicateId }, data: { travelerId: survivorId } }),
        tx.roomAllocation.updateMany({ where: { occupantTravelerId: duplicateId }, data: { occupantTravelerId: survivorId } }),
      ]);

      // Trip membership is a unique pair, so conflicting rows are dropped
      // rather than repointed onto a pair that already exists.
      const memberships = await tx.tripTraveler.findMany({ where: { travelerId: duplicateId } });
      for (const m of memberships) {
        const exists = await tx.tripTraveler.findUnique({
          where: { tripFileId_travelerId: { tripFileId: m.tripFileId, travelerId: survivorId } },
        });
        if (exists) await tx.tripTraveler.delete({ where: { id: m.id } });
        else await tx.tripTraveler.update({ where: { id: m.id }, data: { travelerId: survivorId } });
      }

      // Fill gaps on the survivor from the record being retired.
      await tx.traveler.update({
        where: { id: survivorId },
        data: {
          phoneRaw: survivor.phoneRaw ?? duplicate.phoneRaw,
          phoneNormalized: survivor.phoneNormalized ?? duplicate.phoneNormalized,
          phoneDigits: survivor.phoneDigits ?? duplicate.phoneDigits,
          email: survivor.email ?? duplicate.email,
          nationalityId: survivor.nationalityId ?? duplicate.nationalityId,
          nationalityRaw: survivor.nationalityRaw ?? duplicate.nationalityRaw,
          passportNumber: survivor.passportNumber ?? duplicate.passportNumber,
          partnerId: survivor.partnerId ?? duplicate.partnerId,
          updatedById: ctx.actorId ?? null,
        },
      });

      await tx.traveler.update({
        where: { id: duplicateId },
        data: {
          deletedAt: new Date(),
          isActive: false,
          notes: [duplicate.notes, `Merged into traveller ${survivorId} on ${new Date().toISOString()}.`]
            .filter(Boolean).join('\n'),
        },
      });

      return { moved: moves.map((m) => m.count).reduce((a, b) => a + b, 0), memberships: memberships.length };
    });

    await this.audit.record({
      action: 'TRAVELER_MERGED', entityType: 'Traveler', entityId: survivorId,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: { duplicate: { id: duplicate.id, fullName: duplicate.fullName } },
      after: { survivor: { id: survivor.id, fullName: survivor.fullName } },
      metadata: { recordsMoved: result.moved, membershipsHandled: result.memberships },
    });

    return { survivorId, duplicateId, ...result };
  }
}
