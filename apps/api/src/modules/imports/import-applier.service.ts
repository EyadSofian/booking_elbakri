import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  DataQualityCategory, DataQualitySeverity, ExcursionStatus, HotelBookingStatus,
  ImportRowKind, MatchConfidence, PaymentMethod, PaymentStatus, ParseStatus,
  REFERENCE_PREFIXES, TransferDirection, TransferStatus, TripFileStatus, VisaStatus,
  calculateNights, matchTraveler, normalizeForSearch, reconcileLegacyPayment,
  roundMoney, selectAutoLink, validateHotelDates,
  type GroupedRecord, type TravelerCandidate,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { ReferenceService } from '../../common/services/reference.service';
import { AliasResolverService, type AliasEntityType } from '../master-data/alias-resolver.service';
import { DataQualityService, type RaiseIssueInput } from '../data-quality/data-quality.service';
import {
  countOf, dateOf, moneyOf, phoneOf, rawOf, textOf, timeOf,
  type NormalizedRow,
} from './row-normalizer';
import type { AnalyzedSheet, AnalyzedWorkbook } from './import-analyzer.service';

export interface ApplyContext {
  importRunId: string;
  workbookName: string;
  actorId: string;
}

export interface ApplyResult {
  recordsCreated: number;
  recordsMatched: number;
  issues: RaiseIssueInput[];
  /** rowNumber -> what the row produced, written back onto import_rows. */
  rowOutcomes: Map<number, { entityType: string; entityId: string; matched?: boolean }>;
}

interface ResolvedTraveler {
  id: string;
  matched: boolean;
}

/**
 * Turns an analysed workbook into live records inside a single transaction.
 *
 * Three rules govern everything here:
 *   - every created record carries its provenance (workbook, sheet, row, raw values);
 *   - a value that could not be understood is stored raw and raises an issue,
 *     never replaced by a guess;
 *   - a traveller is only auto-linked on deterministic identity evidence.
 */
/**
 * Hands out references from pre-allocated blocks.
 *
 * Reserving one number at a time costs a database round trip per record, which
 * dominates the cost of a migration. Blocks are reserved in the same
 * transaction, so the numbers are still collision-free across concurrent runs;
 * an unused tail simply leaves a gap in the sequence, which is harmless.
 */
class ReferenceAllocator {
  private readonly blocks = new Map<string, string[]>();

  constructor(
    private readonly references: ReferenceService,
    private readonly tx: Prisma.TransactionClient,
    private readonly blockSize = 250,
  ) {}

  async next(prefix: string): Promise<string> {
    let block = this.blocks.get(prefix);
    if (!block || block.length === 0) {
      block = await this.references.nextBatch(prefix, this.blockSize, this.tx);
      this.blocks.set(prefix, block);
    }
    const value = block.shift();
    if (!value) throw new Error(`Could not allocate a reference for ${prefix}`);
    return value;
  }
}

@Injectable()
export class ImportApplierService {
  private readonly logger = new Logger(ImportApplierService.name);

  /** Set for the duration of one applySheet call. */
  private allocator: ReferenceAllocator | null = null;

  private async nextReference(prefix: string, tx: Prisma.TransactionClient): Promise<string> {
    if (!this.allocator) this.allocator = new ReferenceAllocator(this.references, tx);
    return this.allocator.next(prefix);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceService,
    private readonly aliases: AliasResolverService,
    private readonly dataQuality: DataQualityService,
  ) {}

  async applySheet(
    tx: Prisma.TransactionClient,
    sheet: AnalyzedSheet,
    ctx: ApplyContext,
  ): Promise<ApplyResult> {
    const result: ApplyResult = {
      recordsCreated: 0,
      recordsMatched: 0,
      issues: [],
      rowOutcomes: new Map(),
    };
    if (!sheet.grouping) return result;

    // One allocator per sheet, bound to this transaction.
    this.allocator = new ReferenceAllocator(this.references, tx);

    for (const record of sheet.grouping.records) {
      switch (sheet.detectedKind) {
        case 'HOTEL_BOOKING':
          await this.applyHotelRecord(tx, sheet, record, ctx, result);
          break;
        case 'TRANSFER':
          await this.applyTransferRecord(tx, sheet, record, ctx, result);
          break;
        case 'EXCURSION':
          await this.applyExcursionRecord(tx, sheet, record, ctx, result);
          break;
        case 'VISA':
          await this.applyVisaRecord(tx, sheet, record, ctx, result);
          break;
        case 'PAYMENT':
          await this.applyPaymentRecord(tx, sheet, record, ctx, result);
          break;
        case 'PARTNER_SETTLEMENT':
          await this.applySettlementRecord(tx, sheet, record, ctx, result);
          break;
        default:
          break;
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Hotel bookings
  // -------------------------------------------------------------------------

  /**
   * One named row plus its blank-name continuation rows become ONE booking with
   * several stay segments — the legacy sheet's way of writing "same guest,
   * second hotel" must not become a second anonymous guest.
   */
  private async applyHotelRecord(
    tx: Prisma.TransactionClient,
    sheet: AnalyzedSheet,
    record: GroupedRecord,
    ctx: ApplyContext,
    result: ApplyResult,
  ): Promise<void> {
    const master = sheet.normalizedByRow.get(record.masterRowNumber);
    if (!master) return;

    const name = textOf(master, 'name');
    if (!name) return;

    const partnerId = await this.resolveRef(tx, 'PARTNER', textOf(master, 'agency'), sheet, master, ctx, result);
    const nationalityRaw = textOf(master, 'nationality');
    const nationalityId = await this.resolveRef(tx, 'NATIONALITY', nationalityRaw, sheet, master, ctx, result);

    const traveler = await this.resolveTraveler(tx, name, master, sheet, ctx, result, {
      partnerId, nationalityId, nationalityRaw, phoneField: 'phone',
    });

    const tripFileId = await this.createTripFile(tx, ctx, sheet, master, {
      leadTravelerId: traveler.id,
      partnerId,
      notes: textOf(master, 'notes'),
    });

    const notes = [textOf(master, 'notes'), textOf(master, 'legacyExtra')].filter(Boolean).join(' | ') || null;
    const securityApproval = /security\s*approv/i.test(notes ?? '');

    const reference = await this.nextReference(REFERENCE_PREFIXES.HOTEL_BOOKING, tx);
    const bookingDate = dateOf(master, 'bookingDate');
    const hotelId = await this.resolveRef(tx, 'HOTEL', textOf(master, 'hotel'), sheet, master, ctx, result);

    const booking = await tx.hotelBooking.create({
      data: {
        reference,
        tripFileId,
        leadTravelerId: traveler.id,
        partnerId,
        hotelId,
        hotelRaw: textOf(master, 'hotel'),
        bookingDate,
        status: HotelBookingStatus.CONFIRMED,
        notes,
        securityApprovalRequired: securityApproval,
        importRunId: ctx.importRunId,
        legacySource: this.provenance(sheet, master, ctx),
        createdById: ctx.actorId,
      },
      select: { id: true },
    });
    result.recordsCreated++;
    result.rowOutcomes.set(master.rowNumber, {
      entityType: 'HotelBooking', entityId: booking.id, matched: traveler.matched,
    });

    // The named row is the first stay; each continuation row adds another.
    const segmentRows = [master, ...record.continuations
      .map((c) => sheet.normalizedByRow.get(c.rowNumber))
      .filter((r): r is NormalizedRow => Boolean(r))];

    const tripDates: Array<Date | null> = [];
    let sequence = 1;
    for (const row of segmentRows) {
      const segmentHotelId = row === master
        ? hotelId
        : await this.resolveRef(tx, 'HOTEL', textOf(row, 'hotel'), sheet, row, ctx, result);
      const mealPlanId = await this.resolveRef(tx, 'MEAL_PLAN', textOf(row, 'mealPlan'), sheet, row, ctx, result);
      const roomTypeId = await this.resolveRef(tx, 'ROOM_TYPE', textOf(row, 'roomType'), sheet, row, ctx, result);

      const checkIn = dateOf(row, 'checkIn');
      const checkOut = dateOf(row, 'checkOut');
      tripDates.push(checkIn, checkOut);

      // Historical rows keep their original dates; the rule violation becomes a
      // reviewable issue rather than a silently "corrected" stay.
      const validation = validateHotelDates({ checkIn, checkOut, bookingDate });
      for (const v of validation.violations) {
        result.issues.push(
          this.issue(sheet, row, ctx, {
            category: v.category,
            severity: v.severity,
            entityType: 'HotelStaySegment',
            field: v.code === 'BOOKING_DATE_AFTER_CHECKIN' ? 'bookingDate' : 'checkOut',
            rawValue: rawOf(row, 'checkOut'),
            message: v.message,
            details: v.details,
          }),
        );
      }

      let nights: number | null = null;
      if (checkIn && checkOut) {
        try {
          nights = calculateNights(checkIn, checkOut);
        } catch {
          nights = null; // Reversed dates: recorded as an issue above.
        }
      }

      const segment = await tx.hotelStaySegment.create({
        data: {
          hotelBookingId: booking.id,
          hotelId: segmentHotelId,
          hotelRaw: textOf(row, 'hotel'),
          checkIn,
          checkOut,
          nights,
          mealPlanId,
          mealPlanRaw: textOf(row, 'mealPlan'),
          sequence,
          checkInRaw: rawOf(row, 'checkIn'),
          checkOutRaw: rawOf(row, 'checkOut'),
          checkInParseStatus: row.fields.checkIn?.status ?? null,
          checkOutParseStatus: row.fields.checkOut?.status ?? null,
          notes: row === master ? null : textOf(row, 'notes'),
          legacySource: this.provenance(sheet, row, ctx),
        },
        select: { id: true },
      });

      const roomRaw = textOf(row, 'roomType');
      if (roomRaw || roomTypeId) {
        // "3 dbl standard" / "5 double": a leading figure is the room count.
        const quantityMatch = roomRaw?.match(/^\s*(\d{1,2})\s+/);
        await tx.roomAllocation.create({
          data: {
            hotelStaySegmentId: segment.id,
            roomTypeId,
            roomTypeRaw: roomRaw,
            quantity: quantityMatch ? Number(quantityMatch[1]) : 1,
          },
        });
      }

      if (row !== master) {
        result.rowOutcomes.set(row.rowNumber, { entityType: 'HotelStaySegment', entityId: segment.id });
      }
      sequence++;
    }

    await this.setTripDates(tx, tripFileId, tripDates);
  }

  // -------------------------------------------------------------------------
  // Transfers
  // -------------------------------------------------------------------------

  /**
   * The named row is the arrival leg; blank-name rows below it are the return
   * and any further legs of the same journey.
   */
  private async applyTransferRecord(
    tx: Prisma.TransactionClient,
    sheet: AnalyzedSheet,
    record: GroupedRecord,
    ctx: ApplyContext,
    result: ApplyResult,
  ): Promise<void> {
    const master = sheet.normalizedByRow.get(record.masterRowNumber);
    if (!master) return;
    const name = textOf(master, 'name');
    if (!name) return;

    const partnerId = await this.resolveRef(tx, 'PARTNER', textOf(master, 'agency'), sheet, master, ctx, result);
    const nationalityRaw = textOf(master, 'nationality');
    const nationalityId = await this.resolveRef(tx, 'NATIONALITY', nationalityRaw, sheet, master, ctx, result);

    const traveler = await this.resolveTraveler(tx, name, master, sheet, ctx, result, {
      partnerId, nationalityId, nationalityRaw, phoneField: 'phone',
    });

    const paxCount = countOf(master, 'pax');
    const tripFileId = await this.createTripFile(tx, ctx, sheet, master, {
      leadTravelerId: traveler.id, partnerId, paxCount,
    });

    const reference = await this.nextReference(REFERENCE_PREFIXES.TRANSFER, tx);
    const booking = await tx.transferBooking.create({
      data: {
        reference,
        tripFileId,
        leadTravelerId: traveler.id,
        partnerId,
        paxCount,
        paxCountRaw: rawOf(master, 'pax'),
        status: TransferStatus.SCHEDULED,
        notes: textOf(master, 'notes'),
        importRunId: ctx.importRunId,
        legacySource: this.provenance(sheet, master, ctx),
        createdById: ctx.actorId,
      },
      select: { id: true },
    });
    result.recordsCreated++;
    result.rowOutcomes.set(master.rowNumber, {
      entityType: 'TransferBooking', entityId: booking.id, matched: traveler.matched,
    });

    const legRows = [master, ...record.continuations
      .map((c) => sheet.normalizedByRow.get(c.rowNumber))
      .filter((r): r is NormalizedRow => Boolean(r))];

    const tripDates: Array<Date | null> = [];
    let sequence = 1;
    for (const row of legRows) {
      const fromRaw = textOf(row, 'from');
      const toRaw = textOf(row, 'to');
      const fromLocationId = await this.resolveRef(tx, 'LOCATION', fromRaw, sheet, row, ctx, result);
      const toLocationId = await this.resolveRef(tx, 'LOCATION', toRaw, sheet, row, ctx, result);

      const pickup = timeOf(row, 'pickup');
      if (pickup && pickup.status === ParseStatus.UNPARSEABLE && pickup.raw) {
        result.issues.push(
          this.issue(sheet, row, ctx, {
            category: DataQualityCategory.TIME_PARSE_ERROR,
            severity: DataQualitySeverity.ERROR,
            entityType: 'TransferLeg',
            field: 'pickupTime',
            rawValue: pickup.raw,
            message: `Pickup time "${pickup.raw}" could not be read. The leg has no scheduled pickup and needs one before the day of travel.`,
          }),
        );
      }

      const serviceDate = dateOf(row, 'date');
      tripDates.push(serviceDate);
      if (!serviceDate) {
        result.issues.push(
          this.issue(sheet, row, ctx, {
            category: DataQualityCategory.MISSING_REQUIRED_VALUE,
            severity: DataQualitySeverity.ERROR,
            entityType: 'TransferLeg',
            field: 'serviceDate',
            rawValue: rawOf(row, 'date'),
            message: 'This transfer leg has no usable service date.',
          }),
        );
      }

      const legNotes = textOf(row, 'notes');
      const allText = `${fromRaw ?? ''} ${toRaw ?? ''} ${legNotes ?? ''}`;

      await tx.transferLeg.create({
        data: {
          transferBookingId: booking.id,
          sequence,
          direction: this.inferDirection(fromRaw, toRaw, sequence),
          fromLocationId,
          fromRaw,
          toLocationId,
          toRaw,
          serviceDate,
          serviceDateRaw: rawOf(row, 'date'),
          pickupTimeMinutes: pickup?.minutes ?? null,
          pickupTimeRaw: pickup?.raw ?? null,
          pickupTimeParseStatus: pickup?.status ?? null,
          flightNumber: textOf(row, 'flight'),
          paxCount: countOf(row, 'pax') ?? paxCount,
          // Drivers and vehicles are not in the legacy sheet; they stay unset.
          securityApprovalRequired: /security\s*approv/i.test(allText),
          flowerBouquet: /flower/i.test(allText),
          status: TransferStatus.SCHEDULED,
          notes: legNotes,
          legacySource: this.provenance(sheet, row, ctx),
        },
      });

      if (row !== master) {
        result.rowOutcomes.set(row.rowNumber, { entityType: 'TransferLeg', entityId: booking.id });
      }
      sequence++;
    }

    await this.setTripDates(tx, tripFileId, tripDates);
  }

  /** Arrival, departure or inter-hotel, inferred from the endpoints. */
  private inferDirection(from: string | null, to: string | null, sequence: number): string {
    const isAirport = (v: string | null) => !!v && /airport|\bssh\b|\bhrg\b|matar/i.test(v);
    if (isAirport(from) && !isAirport(to)) return TransferDirection.ARRIVAL;
    if (!isAirport(from) && isAirport(to)) return TransferDirection.DEPARTURE;
    if (from && to) return TransferDirection.INTER_HOTEL;
    return sequence === 1 ? TransferDirection.ARRIVAL : TransferDirection.OTHER;
  }

  // -------------------------------------------------------------------------
  // Excursions
  // -------------------------------------------------------------------------

  /**
   * One customer with several activities. The blank-name rows are extra
   * activities on the same order, not extra customers.
   */
  private async applyExcursionRecord(
    tx: Prisma.TransactionClient,
    sheet: AnalyzedSheet,
    record: GroupedRecord,
    ctx: ApplyContext,
    result: ApplyResult,
  ): Promise<void> {
    const master = sheet.normalizedByRow.get(record.masterRowNumber);
    if (!master) return;
    const name = textOf(master, 'name');
    if (!name) return;

    const partnerId = await this.resolveRef(tx, 'PARTNER', textOf(master, 'agency'), sheet, master, ctx, result);
    const nationalityRaw = textOf(master, 'nationality');
    const nationalityId = await this.resolveRef(tx, 'NATIONALITY', nationalityRaw, sheet, master, ctx, result);
    const hotelId = await this.resolveRef(tx, 'HOTEL', textOf(master, 'hotel'), sheet, master, ctx, result);

    const traveler = await this.resolveTraveler(tx, name, master, sheet, ctx, result, {
      partnerId, nationalityId, nationalityRaw, phoneField: 'phone',
    });

    const paxCount = countOf(master, 'pax');
    const childCount = countOf(master, 'child');
    const tripFileId = await this.createTripFile(tx, ctx, sheet, master, {
      leadTravelerId: traveler.id, partnerId, paxCount, childCount,
    });

    // REST: the business meaning is not established from the workbook alone, so
    // the exact text is stored and no financial interpretation is applied.
    const restRaw = rawOf(master, 'rest');
    if (restRaw && !/^\s*(no|none|-)\s*$/i.test(restRaw)) {
      result.issues.push(
        this.issue(sheet, master, ctx, {
          category: DataQualityCategory.AMBIGUOUS_VALUE,
          severity: DataQualitySeverity.INFO,
          entityType: 'ExcursionBooking',
          field: 'legacyRestRaw',
          rawValue: restRaw,
          message: `The legacy REST column holds "${restRaw}". Its meaning is not defined, so the value has been preserved verbatim without interpretation.`,
        }),
      );
    }

    const reference = await this.nextReference(REFERENCE_PREFIXES.EXCURSION, tx);
    const booking = await tx.excursionBooking.create({
      data: {
        reference,
        tripFileId,
        leadTravelerId: traveler.id,
        partnerId,
        hotelId,
        hotelRaw: textOf(master, 'hotel'),
        paxCount,
        childCount,
        status: ExcursionStatus.CONFIRMED,
        notes: textOf(master, 'notes'),
        legacyRestRaw: restRaw,
        importRunId: ctx.importRunId,
        legacySource: this.provenance(sheet, master, ctx),
        createdById: ctx.actorId,
      },
      select: { id: true },
    });
    result.recordsCreated++;
    result.rowOutcomes.set(master.rowNumber, {
      entityType: 'ExcursionBooking', entityId: booking.id, matched: traveler.matched,
    });

    const itemRows = [master, ...record.continuations
      .map((c) => sheet.normalizedByRow.get(c.rowNumber))
      .filter((r): r is NormalizedRow => Boolean(r))];

    const orderNotes = textOf(master, 'notes') ?? '';
    const tripDates: Array<Date | null> = [];
    let sequence = 1;
    for (const row of itemRows) {
      const activityRaw = textOf(row, 'excursion');
      if (!activityRaw) { sequence++; continue; }

      const catalogItemId = await this.resolveRef(tx, 'EXCURSION', activityRaw, sheet, row, ctx, result);
      const itemDate = dateOf(row, 'date');
      tripDates.push(itemDate);
      const rowNotes = textOf(row, 'notes') ?? '';
      const combinedNotes = `${orderNotes} ${rowNotes}`;

      const item = await tx.excursionItem.create({
        data: {
          excursionBookingId: booking.id,
          catalogItemId,
          activityRaw,
          sequence,
          serviceDate: itemDate,
          serviceDateRaw: rawOf(row, 'date'),
          paxOverride: row === master ? null : countOf(row, 'pax'),
          childOverride: row === master ? null : countOf(row, 'child'),
          // "WITH TRANSFER TO THIS ACTIVITIES" is a confident structural signal.
          transferRequired: /with\s+transfer/i.test(combinedNotes),
          status: ExcursionStatus.CONFIRMED,
          notes: row === master ? null : rowNotes || null,
          legacySource: this.provenance(sheet, row, ctx),
        },
        select: { id: true },
      });

      if (row !== master) {
        result.rowOutcomes.set(row.rowNumber, { entityType: 'ExcursionItem', entityId: item.id });
      }
      sequence++;
    }

    await this.setTripDates(tx, tripFileId, tripDates);
  }

  // -------------------------------------------------------------------------
  // Visas
  // -------------------------------------------------------------------------

  private async applyVisaRecord(
    tx: Prisma.TransactionClient,
    sheet: AnalyzedSheet,
    record: GroupedRecord,
    ctx: ApplyContext,
    result: ApplyResult,
  ): Promise<void> {
    const master = sheet.normalizedByRow.get(record.masterRowNumber);
    if (!master) return;
    const name = textOf(master, 'name');
    if (!name) return;

    const partnerId = await this.resolveRef(tx, 'PARTNER', textOf(master, 'agency'), sheet, master, ctx, result);
    const nationalityRaw = textOf(master, 'nationality');
    const nationalityId = await this.resolveRef(tx, 'NATIONALITY', nationalityRaw, sheet, master, ctx, result);

    const traveler = await this.resolveTraveler(tx, name, master, sheet, ctx, result, {
      partnerId, nationalityId, nationalityRaw, phoneField: 'phone',
    });

    const paxCount = countOf(master, 'pax');
    const tripFileId = await this.createTripFile(tx, ctx, sheet, master, {
      leadTravelerId: traveler.id, partnerId, paxCount,
    });

    const net = moneyOf(master, 'net');
    const sell = moneyOf(master, 'sell');
    const tripDates: Array<Date | null> = [dateOf(master, 'date')];
    // Margin is derived on read from net and sell; it is never stored.
    const reference = await this.nextReference(REFERENCE_PREFIXES.VISA, tx);

    const order = await tx.visaOrder.create({
      data: {
        reference,
        tripFileId,
        leadTravelerId: traveler.id,
        partnerId,
        originRaw: textOf(master, 'from'),
        destinationRaw: textOf(master, 'to'),
        paxCount,
        serviceDate: dateOf(master, 'date'),
        serviceDateRaw: rawOf(master, 'date'),
        netAmount: net?.amount ?? null,
        sellAmount: sell?.amount ?? null,
        currency: net?.currency ?? sell?.currency ?? 'USD',
        status: VisaStatus.COMPLETED,
        notes: record.sectionLabel ? `Legacy section: ${record.sectionLabel}` : null,
        importRunId: ctx.importRunId,
        legacySource: this.provenance(sheet, master, ctx),
        createdById: ctx.actorId,
      },
      select: { id: true },
    });
    result.recordsCreated++;
    result.rowOutcomes.set(master.rowNumber, {
      entityType: 'VisaOrder', entityId: order.id, matched: traveler.matched,
    });

    // Continuation rows on this sheet are additional visa lines for the group.
    let extra = 0;
    for (const cont of record.continuations) {
      const row = sheet.normalizedByRow.get(cont.rowNumber);
      if (!row) continue;
      const contNet = moneyOf(row, 'net');
      const contSell = moneyOf(row, 'sell');
      const contDate = dateOf(row, 'date');
      tripDates.push(contDate);
      const contReference = await this.nextReference(REFERENCE_PREFIXES.VISA, tx);
      const contOrder = await tx.visaOrder.create({
        data: {
          reference: contReference,
          tripFileId,
          leadTravelerId: traveler.id,
          partnerId: await this.resolveRef(tx, 'PARTNER', textOf(row, 'agency'), sheet, row, ctx, result),
          originRaw: textOf(row, 'from'),
          destinationRaw: textOf(row, 'to'),
          paxCount: countOf(row, 'pax'),
          serviceDate: contDate,
          serviceDateRaw: rawOf(row, 'date'),
          netAmount: contNet?.amount ?? null,
          sellAmount: contSell?.amount ?? null,
          currency: contNet?.currency ?? contSell?.currency ?? 'USD',
          status: VisaStatus.COMPLETED,
          notes: `Continuation of row ${master.rowNumber} in the legacy VISA sheet.`,
          importRunId: ctx.importRunId,
          legacySource: this.provenance(sheet, row, ctx),
          createdById: ctx.actorId,
        },
        select: { id: true },
      });
      result.rowOutcomes.set(row.rowNumber, { entityType: 'VisaOrder', entityId: contOrder.id });
      extra++;
    }
    result.recordsCreated += extra;

    await this.setTripDates(tx, tripFileId, tripDates);
  }

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------

  /**
   * Rebuilds the payment sheet as a real ledger.
   *
   * The legacy Total / Paid / REST columns are preserved verbatim. The payable
   * total and any payment become ledger entries, the outstanding balance is
   * derived from them, and where the sheet's REST disagrees with that balance a
   * FINANCIAL_RECONCILIATION_MISMATCH is raised. The historical figures are
   * never overwritten.
   */
  private async applyPaymentRecord(
    tx: Prisma.TransactionClient,
    sheet: AnalyzedSheet,
    record: GroupedRecord,
    ctx: ApplyContext,
    result: ApplyResult,
  ): Promise<void> {
    const master = sheet.normalizedByRow.get(record.masterRowNumber);
    if (!master) return;
    const hotelName = textOf(master, 'hotelName');
    if (!hotelName) return;

    const total = moneyOf(master, 'total');
    const paid = moneyOf(master, 'paid');
    const rest = moneyOf(master, 'rest');

    const hotelId = await this.resolveRef(tx, 'HOTEL', hotelName, sheet, master, ctx, result);
    const counterparty = await this.upsertCounterparty(tx, hotelName, hotelId);

    // A payable with no readable total cannot carry a ledger; it is recorded at
    // zero and flagged, so the row still exists and is visibly unusable.
    if (total?.amount === null || total?.amount === undefined) {
      result.issues.push(
        this.issue(sheet, master, ctx, {
          category: DataQualityCategory.MONEY_PARSE_ERROR,
          severity: DataQualitySeverity.ERROR,
          entityType: 'FinancialDocument',
          field: 'totalAmount',
          rawValue: total?.raw ?? null,
          message: `The payable total "${total?.raw ?? ''}" could not be read as an amount. The document was created with a zero total and the original text preserved.`,
        }),
      );
    }

    const reference = await this.nextReference(REFERENCE_PREFIXES.PAYABLE, tx);
    const totalAmount = total?.amount ?? 0;
    const serviceDate = dateOf(master, 'checkIn');

    const document = await tx.financialDocument.create({
      data: {
        reference,
        type: 'PAYABLE',
        counterpartyId: counterparty,
        serviceDescription: hotelName,
        totalAmount,
        currency: total?.currency ?? 'EGP',
        serviceDate,
        dueDate: serviceDate,
        status: 'OPEN',
        notes: textOf(master, 'status'),
        legacyTotalRaw: total?.raw ?? null,
        legacyPaidRaw: paid?.raw ?? null,
        legacyRestRaw: rest?.raw ?? null,
        legacyPaymentDateRaw: rawOf(master, 'paymentDate'),
        legacyStatusRaw: rawOf(master, 'status'),
        importRunId: ctx.importRunId,
        legacySource: this.provenance(sheet, master, ctx),
        createdById: ctx.actorId,
      },
      select: { id: true },
    });
    result.recordsCreated++;
    result.rowOutcomes.set(master.rowNumber, { entityType: 'FinancialDocument', entityId: document.id });

    const payments: Array<{ amount: number; status: typeof PaymentStatus.POSTED }> = [];
    if (paid?.amount && paid.amount > 0) {
      const paymentReference = await this.nextReference(REFERENCE_PREFIXES.PAYMENT, tx);
      await tx.paymentTransaction.create({
        data: {
          reference: paymentReference,
          financialDocumentId: document.id,
          counterpartyId: counterparty,
          amount: paid.amount,
          currency: paid.currency ?? total?.currency ?? 'EGP',
          paymentDate: dateOf(master, 'paymentDate') ?? serviceDate ?? new Date(),
          method: paid.method ?? PaymentMethod.UNKNOWN,
          status: PaymentStatus.POSTED,
          notes: paid.residualNote ? `Legacy note: ${paid.residualNote}` : null,
          importRunId: ctx.importRunId,
          legacySource: this.provenance(sheet, master, ctx),
          createdById: ctx.actorId,
        },
      });
      payments.push({ amount: paid.amount, status: PaymentStatus.POSTED });
      result.recordsCreated++;
    } else if (paid && paid.status === ParseStatus.UNPARSEABLE && paid.raw) {
      result.issues.push(
        this.issue(sheet, master, ctx, {
          category: DataQualityCategory.MONEY_PARSE_ERROR,
          severity: DataQualitySeverity.WARNING,
          entityType: 'FinancialDocument',
          entityId: document.id,
          field: 'paid',
          rawValue: paid.raw,
          message: `The PAID cell reads "${paid.raw}" with no amount, so no payment was posted. The original text is preserved on the payable.`,
        }),
      );
    }

    const reconciliation = reconcileLegacyPayment({
      legacyTotal: total?.amount ?? null,
      legacyPaid: paid?.amount ?? null,
      legacyRest: rest?.amount ?? null,
      totalAmount,
      payments,
    });

    const derivedStatus = payments.length
      ? (roundMoney(totalAmount - payments[0].amount) <= 0 ? 'PAID' : 'PARTIALLY_PAID')
      : 'OPEN';
    await tx.financialDocument.update({ where: { id: document.id }, data: { status: derivedStatus } });

    if (reconciliation.mismatch) {
      result.issues.push(
        this.issue(sheet, master, ctx, {
          category: DataQualityCategory.FINANCIAL_RECONCILIATION_MISMATCH,
          severity: DataQualitySeverity.WARNING,
          entityType: 'FinancialDocument',
          entityId: document.id,
          field: 'rest',
          rawValue: rest?.raw ?? null,
          message: reconciliation.restLooksLikeSum
            ? `The legacy REST of ${reconciliation.legacyRest} equals Total + Paid rather than the remaining balance. The ledger balance is ${reconciliation.canonicalOutstanding}. The historical figures are unchanged.`
            : `The legacy REST of ${reconciliation.legacyRest} does not match the ledger balance of ${reconciliation.canonicalOutstanding} (difference ${reconciliation.difference}). The historical figures are unchanged.`,
          details: { ...reconciliation },
        }),
      );
    }
  }

  private async upsertCounterparty(
    tx: Prisma.TransactionClient,
    name: string,
    hotelId: string | null,
  ): Promise<string> {
    const normalizedName = normalizeForSearch(name);
    const existing = await tx.counterparty.findFirst({
      where: { normalizedName, type: 'HOTEL' },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.counterparty.create({
      data: { name, normalizedName, type: 'HOTEL', hotelId },
      select: { id: true },
    });
    return created.id;
  }

  // -------------------------------------------------------------------------
  // Partner settlements (the SAMA sheet)
  // -------------------------------------------------------------------------

  /**
   * The SAMA worksheet becomes settlement rows against a generic Partner.
   * Nothing here is specific to SAMA — the same path serves any partner.
   */
  private async applySettlementRecord(
    tx: Prisma.TransactionClient,
    sheet: AnalyzedSheet,
    record: GroupedRecord,
    ctx: ApplyContext,
    result: ApplyResult,
  ): Promise<void> {
    const master = sheet.normalizedByRow.get(record.masterRowNumber);
    if (!master) return;
    const description = textOf(master, 'description');
    if (!description) return;

    const amount = moneyOf(master, 'amount');
    // The sheet name identifies the partner these rows settle with.
    const partnerId = await this.resolveRef(tx, 'PARTNER', sheet.sheetName, sheet, master, ctx, result);

    const reference = await this.nextReference(REFERENCE_PREFIXES.SETTLEMENT, tx);
    const settlement = await tx.settlement.create({
      data: {
        reference,
        partnerId,
        totalAmount: amount?.amount ?? 0,
        currency: amount?.currency ?? 'EGP',
        status: 'OPEN',
        description,
        descriptionAr: /[؀-ۿ]/.test(description) ? description : null,
        notes: [rawOf(master, 'extra1'), rawOf(master, 'extra2'), rawOf(master, 'extra3')]
          .filter(Boolean).join(' | ') || null,
        importRunId: ctx.importRunId,
        legacySource: this.provenance(sheet, master, ctx),
        createdById: ctx.actorId,
      },
      select: { id: true },
    });
    result.recordsCreated++;
    result.rowOutcomes.set(master.rowNumber, { entityType: 'Settlement', entityId: settlement.id });

    if (amount?.amount === null || amount?.amount === undefined) {
      result.issues.push(
        this.issue(sheet, master, ctx, {
          category: DataQualityCategory.MONEY_PARSE_ERROR,
          severity: DataQualitySeverity.WARNING,
          entityType: 'Settlement',
          entityId: settlement.id,
          field: 'totalAmount',
          rawValue: amount?.raw ?? null,
          message: `The settlement amount "${amount?.raw ?? ''}" could not be read. The row was created with a zero total and the original text preserved.`,
        }),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Shared building blocks
  // -------------------------------------------------------------------------

  private provenance(sheet: AnalyzedSheet, row: NormalizedRow, ctx: ApplyContext): Prisma.InputJsonValue {
    return {
      workbook: ctx.workbookName,
      sheet: sheet.sheetName,
      row: row.rowNumber,
      importRunId: ctx.importRunId,
      rawValues: Object.fromEntries(
        Object.entries(row.fields).map(([k, v]) => [k, v.raw]),
      ),
      unmappedValues: row.unmapped,
    } as Prisma.InputJsonValue;
  }

  private issue(
    sheet: AnalyzedSheet,
    row: NormalizedRow,
    ctx: ApplyContext,
    input: Omit<RaiseIssueInput, 'sourceWorkbook' | 'sourceSheet' | 'sourceRow' | 'importRunId'>,
  ): RaiseIssueInput {
    return {
      ...input,
      sourceWorkbook: ctx.workbookName,
      sourceSheet: sheet.sheetName,
      sourceRow: row.rowNumber,
      importRunId: ctx.importRunId,
    };
  }

  /**
   * Resolves a free-text master-data value.
   *
   * Returns the id only for a deterministic match. Anything weaker records a
   * suggestion for review and leaves the id null, so the raw text is what the
   * record carries until a human decides.
   */
  private async resolveRef(
    tx: Prisma.TransactionClient,
    type: AliasEntityType,
    value: string | null,
    sheet: AnalyzedSheet,
    row: NormalizedRow,
    ctx: ApplyContext,
    result: ApplyResult,
  ): Promise<string | null> {
    if (!value) return null;
    const resolved = await this.aliases.resolve(type, value, tx);
    if (resolved.id) return resolved.id;

    await this.aliases.recordSuggestion(type, value, resolved.resolution, ctx.importRunId, tx);
    const suggestion = resolved.resolution.suggestions[0];
    result.issues.push(
      this.issue(sheet, row, ctx, {
        category: DataQualityCategory.UNKNOWN_ALIAS,
        severity: DataQualitySeverity.WARNING,
        entityType: type,
        field: type.toLowerCase(),
        rawValue: value,
        message: suggestion
          ? `"${value}" did not match a ${type.toLowerCase().replace('_', ' ')} exactly. Closest match: "${suggestion.record.name}" (${Math.round(suggestion.score * 100)}%). The original value has been kept.`
          : `"${value}" is not a known ${type.toLowerCase().replace('_', ' ')}. The original value has been kept and needs to be mapped or created.`,
        suggestion: suggestion?.record.name ?? null,
        details: { candidates: resolved.resolution.suggestions.map((s) => ({ id: s.record.id, name: s.record.name, score: s.score })) },
      }),
    );
    return null;
  }

  /**
   * Finds or creates the traveller for a master row.
   *
   * Auto-linking requires an exact normalised name plus an identical phone.
   * A weaker match creates a new traveller and raises a POSSIBLE_DUPLICATE
   * issue, so two people are never silently merged.
   */
  private async resolveTraveler(
    tx: Prisma.TransactionClient,
    name: string,
    row: NormalizedRow,
    sheet: AnalyzedSheet,
    ctx: ApplyContext,
    result: ApplyResult,
    opts: { partnerId: string | null; nationalityId: string | null; nationalityRaw: string | null; phoneField?: string },
  ): Promise<ResolvedTraveler> {
    const phone = opts.phoneField ? phoneOf(row, opts.phoneField) : null;
    const normalizedName = normalizeForSearch(name);

    const candidateRows = await tx.traveler.findMany({
      where: {
        deletedAt: null,
        OR: [
          { normalizedName },
          ...(phone?.normalized ? [{ phoneNormalized: phone.normalized }] : []),
        ],
      },
      select: {
        id: true, fullName: true, normalizedName: true,
        phoneNormalized: true, phoneDigits: true, partnerId: true,
        nationality: { select: { code: true } },
      },
      take: 50,
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
        fullName: name,
        phoneNormalized: phone?.normalized ?? null,
        phoneDigits: phone?.digits ?? null,
        partnerId: opts.partnerId,
      },
      candidates,
    );

    const auto = selectAutoLink(matches);
    if (auto) {
      result.recordsMatched++;
      return { id: auto.candidateId, matched: true };
    }

    if (matches.length && matches[0].confidence !== MatchConfidence.NO_MATCH) {
      const top = matches[0];
      const candidate = candidateRows.find((c) => c.id === top.candidateId);
      result.issues.push(
        this.issue(sheet, row, ctx, {
          category: DataQualityCategory.POSSIBLE_DUPLICATE,
          severity: DataQualitySeverity.WARNING,
          entityType: 'Traveler',
          field: 'fullName',
          rawValue: name,
          message: `"${name}" resembles the existing traveller "${candidate?.fullName}" (${top.confidence}, score ${top.score}). A separate record was created; review and merge if they are the same person.`,
          suggestion: candidate?.fullName ?? null,
          details: { candidateId: top.candidateId, score: top.score, evidence: top.evidence },
        }),
      );
    }

    if (phone && (phone.status === ParseStatus.AMBIGUOUS || phone.status === ParseStatus.UNPARSEABLE) && phone.raw) {
      result.issues.push(
        this.issue(sheet, row, ctx, {
          category: DataQualityCategory.PHONE_PARSE_ERROR,
          severity: DataQualitySeverity.INFO,
          entityType: 'Traveler',
          field: 'phone',
          rawValue: phone.raw,
          message: `Phone "${phone.raw}" could not be normalised with confidence (${phone.warnings.join(', ') || 'unknown format'}). The original value is stored.`,
        }),
      );
    }

    const created = await tx.traveler.create({
      data: {
        fullName: name,
        normalizedName,
        phoneRaw: phone?.raw ?? null,
        phoneNormalized: phone?.normalized ?? null,
        phoneDigits: phone?.digits ?? null,
        countryCallingCode: phone?.countryCallingCode ?? null,
        nationalityId: opts.nationalityId,
        nationalityRaw: opts.nationalityRaw,
        partnerId: opts.partnerId,
        importRunId: ctx.importRunId,
        legacySource: this.provenance(sheet, row, ctx),
        createdById: ctx.actorId,
      },
      select: { id: true },
    });

    result.recordsCreated++;
    return { id: created.id, matched: false };
  }

  /** Creates the TripFile that owns the services from one legacy record. */
  private async createTripFile(
    tx: Prisma.TransactionClient,
    ctx: ApplyContext,
    sheet: AnalyzedSheet,
    row: NormalizedRow,
    data: {
      leadTravelerId: string | null;
      partnerId: string | null;
      paxCount?: number | null;
      childCount?: number | null;
      notes?: string | null;
    },
  ): Promise<string> {
    const reference = await this.nextReference(REFERENCE_PREFIXES.TRIP, tx);
    const trip = await tx.tripFile.create({
      data: {
        reference,
        leadTravelerId: data.leadTravelerId,
        partnerId: data.partnerId,
        status: TripFileStatus.CONFIRMED,
        paxCount: data.paxCount ?? null,
        childCount: data.childCount ?? null,
        notes: data.notes ?? null,
        importRunId: ctx.importRunId,
        legacySource: this.provenance(sheet, row, ctx),
        createdById: ctx.actorId,
      },
      select: { id: true },
    });
    if (data.leadTravelerId) {
      await tx.tripTraveler.create({
        data: { tripFileId: trip.id, travelerId: data.leadTravelerId, role: 'LEAD' },
      });
    }
    return trip.id;
  }

  /**
   * Sets a trip's travel window from the dates the caller just wrote.
   *
   * An import creates the trip and all of its services in one pass, so the
   * dates are already in hand. Re-reading four tables per record would add
   * thousands of round trips to a migration and tell us nothing new.
   */
  private async setTripDates(
    tx: Prisma.TransactionClient,
    tripFileId: string,
    dates: Array<Date | null | undefined>,
  ): Promise<void> {
    const times = dates.filter((d): d is Date => d instanceof Date).map((d) => d.getTime());
    if (!times.length) return;
    await tx.tripFile.update({
      where: { id: tripFileId },
      data: {
        travelStartDate: new Date(Math.min(...times)),
        travelEndDate: new Date(Math.max(...times)),
      },
    });
  }
}
