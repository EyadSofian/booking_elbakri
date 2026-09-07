import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { calculateMargin, calculateOutstanding, calculatePaid, PaymentStatus } from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { ValidationError } from '../../common/errors';

export type ReportKey =
  | 'hotel-bookings' | 'transfers' | 'excursions' | 'visas'
  | 'payables' | 'payments' | 'outstanding'
  | 'todays-operations' | 'agency' | 'hotel';

export interface ReportFilters {
  dateFrom?: Date;
  dateTo?: Date;
  partnerId?: string;
  hotelId?: string;
  status?: string[];
  /**
   * Legacy layout reproduces the original spreadsheet's column headings so the
   * team can keep working alongside their old files during the transition.
   */
  legacyLayout?: boolean;
}

function num(value: Prisma.Decimal | number | null): number {
  if (value === null) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}

const hhmm = (m: number | null): string =>
  m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const day = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '');

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Builds an .xlsx workbook for the requested report and filters. */
  async generate(key: ReportKey, filters: ReportFilters): Promise<{ buffer: Buffer; filename: string }> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ELBAKRI OVERSEAS Operations';
    workbook.created = new Date();

    const rows = await this.rowsFor(key, filters);
    const sheet = workbook.addWorksheet(rows.sheetName);

    sheet.columns = rows.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? 18,
    }));
    sheet.addRows(rows.data);

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2352' } };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: rows.columns.length },
    };

    const suffix = filters.legacyLayout ? '-legacy' : '';
    const stamp = new Date().toISOString().slice(0, 10);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { buffer, filename: `elbakri-${key}${suffix}-${stamp}.xlsx` };
  }

  private async rowsFor(
    key: ReportKey,
    filters: ReportFilters,
  ): Promise<{ sheetName: string; columns: Array<{ header: string; key: string; width?: number }>; data: Record<string, unknown>[] }> {
    switch (key) {
      case 'hotel-bookings': return this.hotelBookings(filters);
      case 'transfers': return this.transfers(filters);
      case 'excursions': return this.excursions(filters);
      case 'visas': return this.visas(filters);
      case 'payables': return this.payables(filters);
      case 'payments': return this.payments(filters);
      case 'outstanding': return this.payables({ ...filters, status: ['OPEN', 'PARTIALLY_PAID'] });
      case 'todays-operations': return this.todaysOperations(filters);
      case 'agency': return this.agencySummary(filters);
      case 'hotel': return this.hotelSummary(filters);
      default:
        throw new ValidationError(`Unknown report "${key}".`);
    }
  }

  // -------------------------------------------------------------------------

  private async hotelBookings(filters: ReportFilters) {
    const segments = await this.prisma.hotelStaySegment.findMany({
      where: {
        hotelBooking: {
          deletedAt: null,
          ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
          ...(filters.status?.length ? { status: { in: filters.status } } : {}),
        },
        ...(filters.hotelId ? { hotelId: filters.hotelId } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              checkIn: {
                ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
                ...(filters.dateTo ? { lte: filters.dateTo } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ checkIn: 'asc' }],
      include: {
        hotel: true,
        mealPlan: true,
        roomAllocations: { include: { roomType: true } },
        hotelBooking: {
          include: {
            hotel: true,
            partner: true,
            leadTraveler: { include: { nationality: true } },
            tripFile: { select: { reference: true } },
          },
        },
      },
    });

    const data = segments.map((s) => {
      const b = s.hotelBooking;
      const rooms = s.roomAllocations
        .map((r) => `${r.quantity > 1 ? `${r.quantity} ` : ''}${r.roomType?.name ?? r.roomTypeRaw ?? ''}`.trim())
        .filter(Boolean).join(', ');
      return {
        NAME: b.leadTraveler?.fullName ?? '',
        NATIONALITY: b.leadTraveler?.nationality?.name ?? b.leadTraveler?.nationalityRaw ?? '',
        PHONE: b.leadTraveler?.phoneRaw ?? b.leadTraveler?.phoneNormalized ?? '',
        'CHECK IN': day(s.checkIn),
        'CHECK OUT': day(s.checkOut),
        HOTEL: s.hotel?.name ?? s.hotelRaw ?? b.hotel?.name ?? b.hotelRaw ?? '',
        'TYPE ROOM': rooms,
        'MEAL PLAN': s.mealPlan?.name ?? s.mealPlanRaw ?? '',
        'BOOKING DATE': day(b.bookingDate),
        'TRAVEL AGENCY': b.partner?.name ?? '',
        NOTES: b.notes ?? '',
        ...(filters.legacyLayout
          ? {}
          : {
              REFERENCE: b.reference,
              'TRIP FILE': b.tripFile?.reference ?? '',
              NIGHTS: s.nights ?? '',
              STATUS: b.status,
              CONFIRMATION: b.confirmationNumber ?? '',
            }),
      };
    });

    // Column order matches the original workbook so the file looks familiar.
    const legacyColumns = [
      { header: 'NAME', key: 'NAME', width: 28 },
      { header: 'NATIONALITY', key: 'NATIONALITY', width: 16 },
      { header: 'PHONE', key: 'PHONE', width: 18 },
      { header: 'CHECK IN', key: 'CHECK IN', width: 13 },
      { header: 'CHECK OUT', key: 'CHECK OUT', width: 13 },
      { header: 'HOTEL', key: 'HOTEL', width: 28 },
      { header: 'TYPE ROOM', key: 'TYPE ROOM', width: 22 },
      { header: 'MEAL PLAN', key: 'MEAL PLAN', width: 18 },
      { header: 'BOOKING DATE', key: 'BOOKING DATE', width: 14 },
      { header: 'TRAVEL AGENCY', key: 'TRAVEL AGENCY', width: 20 },
      { header: 'NOTES', key: 'NOTES', width: 30 },
    ];
    const extra = [
      { header: 'REFERENCE', key: 'REFERENCE', width: 16 },
      { header: 'TRIP FILE', key: 'TRIP FILE', width: 16 },
      { header: 'NIGHTS', key: 'NIGHTS', width: 9 },
      { header: 'STATUS', key: 'STATUS', width: 14 },
      { header: 'CONFIRMATION', key: 'CONFIRMATION', width: 18 },
    ];

    return {
      sheetName: 'Hotel bookings',
      columns: filters.legacyLayout ? legacyColumns : [...legacyColumns, ...extra],
      data,
    };
  }

  private async transfers(filters: ReportFilters) {
    const legs = await this.prisma.transferLeg.findMany({
      where: {
        transferBooking: {
          deletedAt: null,
          ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
        },
        ...(filters.status?.length ? { status: { in: filters.status } } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              serviceDate: {
                ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
                ...(filters.dateTo ? { lte: filters.dateTo } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ serviceDate: 'asc' }, { pickupTimeMinutes: 'asc' }],
      include: {
        fromLocation: true, toLocation: true, driver: true, vehicle: true,
        transferBooking: {
          include: {
            partner: true,
            leadTraveler: { include: { nationality: true } },
            tripFile: { select: { reference: true } },
          },
        },
      },
    });

    const data = legs.map((l) => {
      const b = l.transferBooking;
      return {
        NAME: b.leadTraveler?.fullName ?? '',
        PHONE: b.leadTraveler?.phoneRaw ?? '',
        FROM: l.fromLocation?.name ?? l.fromRaw ?? '',
        TO: l.toLocation?.name ?? l.toRaw ?? '',
        PAXS: l.paxCount ?? b.paxCount ?? '',
        NATIONALITY: b.leadTraveler?.nationality?.name ?? b.leadTraveler?.nationalityRaw ?? '',
        DATE: day(l.serviceDate),
        'FLIGHT NUMBER': l.flightNumber ?? '',
        // The original pickup text is exported alongside the parsed time so a
        // coordinator can always see what the source actually said.
        PICKUP: hhmm(l.pickupTimeMinutes) || (l.pickupTimeRaw ?? ''),
        'TRAVEL AGENCY': b.partner?.name ?? '',
        NOTES: l.notes ?? b.notes ?? '',
        ...(filters.legacyLayout
          ? {}
          : {
              REFERENCE: b.reference,
              'TRIP FILE': b.tripFile?.reference ?? '',
              DIRECTION: l.direction,
              STATUS: l.status,
              DRIVER: l.driver?.fullName ?? '',
              VEHICLE: l.vehicle?.plateNumber ?? '',
              'PICKUP (SOURCE)': l.pickupTimeRaw ?? '',
            }),
      };
    });

    const legacyColumns = [
      { header: 'NAME', key: 'NAME', width: 28 },
      { header: 'PHONE', key: 'PHONE', width: 18 },
      { header: 'FROM', key: 'FROM', width: 24 },
      { header: 'TO', key: 'TO', width: 24 },
      { header: 'PAXS', key: 'PAXS', width: 8 },
      { header: 'NATIONALITY', key: 'NATIONALITY', width: 16 },
      { header: 'DATE', key: 'DATE', width: 13 },
      { header: 'FLIGHT NUMBER', key: 'FLIGHT NUMBER', width: 15 },
      { header: 'PICKUP', key: 'PICKUP', width: 12 },
      { header: 'TRAVEL AGENCY', key: 'TRAVEL AGENCY', width: 20 },
      { header: 'NOTES', key: 'NOTES', width: 30 },
    ];
    const extra = [
      { header: 'REFERENCE', key: 'REFERENCE', width: 16 },
      { header: 'TRIP FILE', key: 'TRIP FILE', width: 16 },
      { header: 'DIRECTION', key: 'DIRECTION', width: 14 },
      { header: 'STATUS', key: 'STATUS', width: 14 },
      { header: 'DRIVER', key: 'DRIVER', width: 20 },
      { header: 'VEHICLE', key: 'VEHICLE', width: 14 },
      { header: 'PICKUP (SOURCE)', key: 'PICKUP (SOURCE)', width: 16 },
    ];

    return {
      sheetName: 'Transfers',
      columns: filters.legacyLayout ? legacyColumns : [...legacyColumns, ...extra],
      data,
    };
  }

  private async excursions(filters: ReportFilters) {
    const items = await this.prisma.excursionItem.findMany({
      where: {
        excursionBooking: {
          deletedAt: null,
          ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
          ...(filters.hotelId ? { hotelId: filters.hotelId } : {}),
        },
        ...(filters.status?.length ? { status: { in: filters.status } } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              serviceDate: {
                ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
                ...(filters.dateTo ? { lte: filters.dateTo } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ serviceDate: 'asc' }],
      include: {
        catalogItem: true,
        excursionBooking: {
          include: {
            hotel: true, partner: true,
            leadTraveler: { include: { nationality: true } },
            tripFile: { select: { reference: true } },
          },
        },
      },
    });

    const data = items.map((i) => {
      const b = i.excursionBooking;
      return {
        NAME: b.leadTraveler?.fullName ?? '',
        PAXS: i.paxOverride ?? b.paxCount ?? '',
        CHILD: i.childOverride ?? b.childCount ?? '',
        PHONE: b.leadTraveler?.phoneRaw ?? '',
        NATIONALITY: b.leadTraveler?.nationality?.name ?? b.leadTraveler?.nationalityRaw ?? '',
        HOTEL: b.hotel?.name ?? b.hotelRaw ?? '',
        EX: i.catalogItem?.name ?? i.activityRaw ?? '',
        DATE: day(i.serviceDate),
        // The legacy REST column is exported verbatim, with no interpretation.
        REST: b.legacyRestRaw ?? '',
        'TRAVEL AGENCY': b.partner?.name ?? '',
        NOTES: i.notes ?? b.notes ?? '',
        ...(filters.legacyLayout
          ? {}
          : {
              REFERENCE: b.reference,
              'TRIP FILE': b.tripFile?.reference ?? '',
              STATUS: i.status,
              'TRANSFER REQUIRED': i.transferRequired ? 'YES' : 'NO',
            }),
      };
    });

    const legacyColumns = [
      { header: 'NAME', key: 'NAME', width: 28 },
      { header: 'PAXS', key: 'PAXS', width: 8 },
      { header: 'CHILD', key: 'CHILD', width: 8 },
      { header: 'PHONE', key: 'PHONE', width: 18 },
      { header: 'NATIONALITY', key: 'NATIONALITY', width: 16 },
      { header: 'HOTEL', key: 'HOTEL', width: 26 },
      { header: 'EX', key: 'EX', width: 28 },
      { header: 'DATE', key: 'DATE', width: 13 },
      { header: 'REST', key: 'REST', width: 12 },
      { header: 'TRAVEL AGENCY', key: 'TRAVEL AGENCY', width: 20 },
      { header: 'NOTES', key: 'NOTES', width: 30 },
    ];
    const extra = [
      { header: 'REFERENCE', key: 'REFERENCE', width: 16 },
      { header: 'TRIP FILE', key: 'TRIP FILE', width: 16 },
      { header: 'STATUS', key: 'STATUS', width: 14 },
      { header: 'TRANSFER REQUIRED', key: 'TRANSFER REQUIRED', width: 18 },
    ];

    return {
      sheetName: 'Excursions',
      columns: filters.legacyLayout ? legacyColumns : [...legacyColumns, ...extra],
      data,
    };
  }

  private async visas(filters: ReportFilters) {
    const orders = await this.prisma.visaOrder.findMany({
      where: {
        deletedAt: null,
        ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
        ...(filters.status?.length ? { status: { in: filters.status } } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              serviceDate: {
                ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
                ...(filters.dateTo ? { lte: filters.dateTo } : {}),
              },
            }
          : {}),
      },
      orderBy: { serviceDate: 'asc' },
      include: {
        partner: true,
        leadTraveler: { include: { nationality: true } },
        tripFile: { select: { reference: true } },
      },
    });

    const data = orders.map((v) => {
      const net = v.netAmount === null ? null : num(v.netAmount);
      const sell = v.sellAmount === null ? null : num(v.sellAmount);
      return {
        NAME: v.leadTraveler?.fullName ?? '',
        PHONE: v.leadTraveler?.phoneRaw ?? '',
        FROM: v.originRaw ?? '',
        TO: v.destinationRaw ?? '',
        PAXS: v.paxCount ?? '',
        NATIONALITY: v.leadTraveler?.nationality?.name ?? v.leadTraveler?.nationalityRaw ?? '',
        DATE: day(v.serviceDate),
        'TRAVEL AGENCY': v.partner?.name ?? '',
        NET: net ?? '',
        SELL: sell ?? '',
        ...(filters.legacyLayout
          ? {}
          : {
              // Margin is derived here exactly as it is everywhere else.
              MARGIN: calculateMargin(sell, net) ?? '',
              REFERENCE: v.reference,
              'TRIP FILE': v.tripFile?.reference ?? '',
              STATUS: v.status,
              CURRENCY: v.currency,
            }),
      };
    });

    const legacyColumns = [
      { header: 'NAME', key: 'NAME', width: 28 },
      { header: 'PHONE', key: 'PHONE', width: 18 },
      { header: 'FROM', key: 'FROM', width: 16 },
      { header: 'TO', key: 'TO', width: 16 },
      { header: 'PAXS', key: 'PAXS', width: 8 },
      { header: 'NATIONALITY', key: 'NATIONALITY', width: 16 },
      { header: 'DATE', key: 'DATE', width: 13 },
      { header: 'TRAVEL AGENCY', key: 'TRAVEL AGENCY', width: 20 },
      { header: 'NET', key: 'NET', width: 12 },
      { header: 'SELL', key: 'SELL', width: 12 },
    ];
    const extra = [
      { header: 'MARGIN', key: 'MARGIN', width: 12 },
      { header: 'REFERENCE', key: 'REFERENCE', width: 16 },
      { header: 'TRIP FILE', key: 'TRIP FILE', width: 16 },
      { header: 'STATUS', key: 'STATUS', width: 18 },
      { header: 'CURRENCY', key: 'CURRENCY', width: 10 },
    ];

    return {
      sheetName: 'Visas',
      columns: filters.legacyLayout ? legacyColumns : [...legacyColumns, ...extra],
      data,
    };
  }

  private async payables(filters: ReportFilters) {
    const documents = await this.prisma.financialDocument.findMany({
      where: {
        deletedAt: null,
        ...(filters.status?.length ? { status: { in: filters.status } } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              serviceDate: {
                ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
                ...(filters.dateTo ? { lte: filters.dateTo } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ dueDate: 'asc' }],
      include: {
        counterparty: true,
        tripFile: { select: { reference: true } },
        payments: { select: { amount: true, status: true } },
      },
    });

    const data = documents.map((d) => {
      const payments = d.payments.map((p) => ({
        amount: num(p.amount),
        status: p.status as (typeof PaymentStatus)[keyof typeof PaymentStatus],
      }));
      const total = num(d.totalAmount);
      return {
        REFERENCE: d.reference,
        COUNTERPARTY: d.counterparty?.name ?? '',
        SERVICE: d.serviceDescription ?? '',
        'TRIP FILE': d.tripFile?.reference ?? '',
        TOTAL: total,
        // Paid and outstanding come from the ledger, never from a typed column.
        PAID: calculatePaid(payments),
        OUTSTANDING: calculateOutstanding(total, payments),
        CURRENCY: d.currency,
        'SERVICE DATE': day(d.serviceDate),
        'DUE DATE': day(d.dueDate),
        STATUS: d.status,
        // Legacy figures travel with the row so the two can be compared.
        'LEGACY TOTAL': d.legacyTotalRaw ?? '',
        'LEGACY PAID': d.legacyPaidRaw ?? '',
        'LEGACY REST': d.legacyRestRaw ?? '',
        'LEGACY STATUS': d.legacyStatusRaw ?? '',
      };
    });

    return {
      sheetName: 'Payables',
      columns: [
        { header: 'REFERENCE', key: 'REFERENCE', width: 16 },
        { header: 'COUNTERPARTY', key: 'COUNTERPARTY', width: 28 },
        { header: 'SERVICE', key: 'SERVICE', width: 28 },
        { header: 'TRIP FILE', key: 'TRIP FILE', width: 16 },
        { header: 'TOTAL', key: 'TOTAL', width: 14 },
        { header: 'PAID', key: 'PAID', width: 14 },
        { header: 'OUTSTANDING', key: 'OUTSTANDING', width: 14 },
        { header: 'CURRENCY', key: 'CURRENCY', width: 10 },
        { header: 'SERVICE DATE', key: 'SERVICE DATE', width: 13 },
        { header: 'DUE DATE', key: 'DUE DATE', width: 13 },
        { header: 'STATUS', key: 'STATUS', width: 16 },
        { header: 'LEGACY TOTAL', key: 'LEGACY TOTAL', width: 14 },
        { header: 'LEGACY PAID', key: 'LEGACY PAID', width: 14 },
        { header: 'LEGACY REST', key: 'LEGACY REST', width: 14 },
        { header: 'LEGACY STATUS', key: 'LEGACY STATUS', width: 16 },
      ],
      data,
    };
  }

  private async payments(filters: ReportFilters) {
    const payments = await this.prisma.paymentTransaction.findMany({
      where: {
        ...(filters.dateFrom || filters.dateTo
          ? {
              paymentDate: {
                ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
                ...(filters.dateTo ? { lte: filters.dateTo } : {}),
              },
            }
          : {}),
      },
      orderBy: { paymentDate: 'desc' },
      include: {
        counterparty: true,
        financialDocument: { select: { reference: true, serviceDescription: true } },
      },
    });

    return {
      sheetName: 'Payments',
      columns: [
        { header: 'REFERENCE', key: 'REFERENCE', width: 16 },
        { header: 'DATE', key: 'DATE', width: 13 },
        { header: 'COUNTERPARTY', key: 'COUNTERPARTY', width: 28 },
        { header: 'DOCUMENT', key: 'DOCUMENT', width: 16 },
        { header: 'SERVICE', key: 'SERVICE', width: 28 },
        { header: 'AMOUNT', key: 'AMOUNT', width: 14 },
        { header: 'CURRENCY', key: 'CURRENCY', width: 10 },
        { header: 'METHOD', key: 'METHOD', width: 16 },
        { header: 'STATUS', key: 'STATUS', width: 12 },
        { header: 'NOTES', key: 'NOTES', width: 30 },
      ],
      data: payments.map((p) => ({
        REFERENCE: p.reference,
        DATE: day(p.paymentDate),
        COUNTERPARTY: p.counterparty?.name ?? '',
        DOCUMENT: p.financialDocument?.reference ?? '',
        SERVICE: p.financialDocument?.serviceDescription ?? '',
        AMOUNT: num(p.amount),
        CURRENCY: p.currency,
        METHOD: p.method,
        STATUS: p.status,
        NOTES: p.notes ?? '',
      })),
    };
  }

  private async todaysOperations(filters: ReportFilters) {
    const date = filters.dateFrom ?? new Date();
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const end = new Date(start.getTime() + 86400000);

    const [legs, checkIns, checkOuts, excursionItems] = await Promise.all([
      this.prisma.transferLeg.findMany({
        where: { serviceDate: { gte: start, lt: end } },
        include: {
          fromLocation: true, toLocation: true, driver: true, vehicle: true,
          transferBooking: { include: { leadTraveler: true, partner: true } },
        },
      }),
      this.prisma.hotelStaySegment.findMany({
        where: { checkIn: { gte: start, lt: end }, hotelBooking: { deletedAt: null } },
        include: { hotel: true, hotelBooking: { include: { leadTraveler: true, partner: true, hotel: true } } },
      }),
      this.prisma.hotelStaySegment.findMany({
        where: { checkOut: { gte: start, lt: end }, hotelBooking: { deletedAt: null } },
        include: { hotel: true, hotelBooking: { include: { leadTraveler: true, partner: true, hotel: true } } },
      }),
      this.prisma.excursionItem.findMany({
        where: { serviceDate: { gte: start, lt: end }, excursionBooking: { deletedAt: null } },
        include: { catalogItem: true, excursionBooking: { include: { leadTraveler: true, partner: true, hotel: true } } },
      }),
    ]);

    const data: Record<string, unknown>[] = [
      ...legs.map((l) => ({
        TIME: hhmm(l.pickupTimeMinutes),
        TYPE: l.direction === 'ARRIVAL' ? 'AIRPORT PICKUP' : l.direction === 'DEPARTURE' ? 'AIRPORT DROP-OFF' : 'TRANSFER',
        TRAVELER: l.transferBooking.leadTraveler?.fullName ?? '',
        PHONE: l.transferBooking.leadTraveler?.phoneRaw ?? '',
        DETAIL: `${l.fromLocation?.name ?? l.fromRaw ?? '?'} to ${l.toLocation?.name ?? l.toRaw ?? '?'}`,
        FLIGHT: l.flightNumber ?? '',
        PAX: l.paxCount ?? l.transferBooking.paxCount ?? '',
        AGENCY: l.transferBooking.partner?.name ?? '',
        ASSIGNED: l.driver?.fullName ?? '',
        STATUS: l.status,
      })),
      ...checkIns.map((s) => ({
        TIME: '14:00',
        TYPE: 'HOTEL CHECK-IN',
        TRAVELER: s.hotelBooking.leadTraveler?.fullName ?? '',
        PHONE: s.hotelBooking.leadTraveler?.phoneRaw ?? '',
        DETAIL: s.hotel?.name ?? s.hotelRaw ?? s.hotelBooking.hotel?.name ?? '',
        FLIGHT: '',
        PAX: '',
        AGENCY: s.hotelBooking.partner?.name ?? '',
        ASSIGNED: '',
        STATUS: s.hotelBooking.status,
      })),
      ...checkOuts.map((s) => ({
        TIME: '12:00',
        TYPE: 'HOTEL CHECK-OUT',
        TRAVELER: s.hotelBooking.leadTraveler?.fullName ?? '',
        PHONE: s.hotelBooking.leadTraveler?.phoneRaw ?? '',
        DETAIL: s.hotel?.name ?? s.hotelRaw ?? s.hotelBooking.hotel?.name ?? '',
        FLIGHT: '',
        PAX: '',
        AGENCY: s.hotelBooking.partner?.name ?? '',
        ASSIGNED: '',
        STATUS: s.hotelBooking.status,
      })),
      ...excursionItems.map((i) => ({
        TIME: hhmm(i.serviceTimeMinutes),
        TYPE: 'EXCURSION',
        TRAVELER: i.excursionBooking.leadTraveler?.fullName ?? '',
        PHONE: i.excursionBooking.leadTraveler?.phoneRaw ?? '',
        DETAIL: i.catalogItem?.name ?? i.activityRaw ?? '',
        FLIGHT: '',
        PAX: i.paxOverride ?? i.excursionBooking.paxCount ?? '',
        AGENCY: i.excursionBooking.partner?.name ?? '',
        ASSIGNED: '',
        STATUS: i.status,
      })),
    ].sort((a, b) => String(a.TIME).localeCompare(String(b.TIME)));

    return {
      sheetName: `Operations ${start.toISOString().slice(0, 10)}`,
      columns: [
        { header: 'TIME', key: 'TIME', width: 8 },
        { header: 'TYPE', key: 'TYPE', width: 20 },
        { header: 'TRAVELER', key: 'TRAVELER', width: 28 },
        { header: 'PHONE', key: 'PHONE', width: 18 },
        { header: 'DETAIL', key: 'DETAIL', width: 40 },
        { header: 'FLIGHT', key: 'FLIGHT', width: 12 },
        { header: 'PAX', key: 'PAX', width: 8 },
        { header: 'AGENCY', key: 'AGENCY', width: 20 },
        { header: 'ASSIGNED', key: 'ASSIGNED', width: 20 },
        { header: 'STATUS', key: 'STATUS', width: 14 },
      ],
      data,
    };
  }

  private async agencySummary(_filters: ReportFilters) {
    const partners = await this.prisma.partner.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            tripFiles: true, hotelBookings: true, transferBookings: true,
            excursionBookings: true, visaOrders: true,
          },
        },
      },
    });

    return {
      sheetName: 'Agencies',
      columns: [
        { header: 'AGENCY', key: 'AGENCY', width: 30 },
        { header: 'TYPE', key: 'TYPE', width: 18 },
        { header: 'TRIP FILES', key: 'TRIP FILES', width: 12 },
        { header: 'HOTEL BOOKINGS', key: 'HOTEL BOOKINGS', width: 16 },
        { header: 'TRANSFERS', key: 'TRANSFERS', width: 12 },
        { header: 'EXCURSIONS', key: 'EXCURSIONS', width: 12 },
        { header: 'VISAS', key: 'VISAS', width: 10 },
        { header: 'PHONE', key: 'PHONE', width: 18 },
      ],
      data: partners.map((p) => ({
        AGENCY: p.name,
        TYPE: p.type,
        'TRIP FILES': p._count.tripFiles,
        'HOTEL BOOKINGS': p._count.hotelBookings,
        TRANSFERS: p._count.transferBookings,
        EXCURSIONS: p._count.excursionBookings,
        VISAS: p._count.visaOrders,
        PHONE: p.phone ?? '',
      })),
    };
  }

  private async hotelSummary(_filters: ReportFilters) {
    const hotels = await this.prisma.hotel.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { bookings: true, staySegments: true } } },
    });

    return {
      sheetName: 'Hotels',
      columns: [
        { header: 'HOTEL', key: 'HOTEL', width: 32 },
        { header: 'CITY', key: 'CITY', width: 18 },
        { header: 'STARS', key: 'STARS', width: 8 },
        { header: 'BOOKINGS', key: 'BOOKINGS', width: 12 },
        { header: 'STAYS', key: 'STAYS', width: 12 },
        { header: 'PHONE', key: 'PHONE', width: 18 },
      ],
      data: hotels.map((h) => ({
        HOTEL: h.name,
        CITY: h.city ?? '',
        STARS: h.starRating ?? '',
        BOOKINGS: h._count.bookings,
        STAYS: h._count.staySegments,
        PHONE: h.phone ?? '',
      })),
    };
  }
}
