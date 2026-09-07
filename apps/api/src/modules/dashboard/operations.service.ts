import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  calculateOutstanding, DataQualityStatus, FinancialDocumentStatus,
  PaymentStatus, TransferStatus, TripFileStatus, VisaStatus, roundMoney,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';

export interface DayWindow {
  start: Date;
  end: Date;
  date: string;
}

function num(value: Prisma.Decimal | number | null): number {
  if (value === null) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}

const hhmm = (m: number | null): string | null =>
  m === null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Visa statuses that still need work before travel. */
const PENDING_VISA_STATUSES = [
  VisaStatus.DRAFT, VisaStatus.DOCUMENTS_PENDING, VisaStatus.SUBMITTED, VisaStatus.UNDER_REVIEW,
];

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * The operational day.
   *
   * Service dates are stored as calendar dates at UTC midnight, so a day runs
   * from that midnight to the next. This keeps "today" stable for staff in
   * Egypt regardless of where the server runs.
   */
  dayWindow(input?: Date): DayWindow {
    const base = input ?? new Date();
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
    return {
      start,
      end: new Date(start.getTime() + 86400000),
      date: start.toISOString().slice(0, 10),
    };
  }

  /** The headline counters: what needs attention right now. */
  async summary(date?: Date): Promise<unknown> {
    const day = this.dayWindow(date);
    const inDay = { gte: day.start, lt: day.end };
    const soon = new Date(day.start.getTime() + 7 * 86400000);

    const [
      checkInsToday, checkOutsToday, arrivalsToday, departuresToday,
      excursionsToday, pendingVisas, openTrips, unassignedTransfers,
      missingPickups, openIssues, documents, visasNearTravel,
    ] = await Promise.all([
      this.prisma.hotelStaySegment.count({
        where: { checkIn: inDay, hotelBooking: { deletedAt: null, status: { not: 'CANCELLED' } } },
      }),
      this.prisma.hotelStaySegment.count({
        where: { checkOut: inDay, hotelBooking: { deletedAt: null, status: { not: 'CANCELLED' } } },
      }),
      this.prisma.transferLeg.count({
        where: { serviceDate: inDay, direction: 'ARRIVAL', status: { notIn: [TransferStatus.CANCELLED] } },
      }),
      this.prisma.transferLeg.count({
        where: { serviceDate: inDay, direction: 'DEPARTURE', status: { notIn: [TransferStatus.CANCELLED] } },
      }),
      this.prisma.excursionItem.count({
        where: { serviceDate: inDay, excursionBooking: { deletedAt: null }, status: { not: 'CANCELLED' } },
      }),
      this.prisma.visaOrder.count({
        where: { deletedAt: null, status: { in: PENDING_VISA_STATUSES } },
      }),
      this.prisma.tripFile.count({
        where: {
          deletedAt: null,
          status: { in: [TripFileStatus.DRAFT, TripFileStatus.REQUESTED, TripFileStatus.CONFIRMED, TripFileStatus.IN_PROGRESS, TripFileStatus.ON_HOLD] },
        },
      }),
      this.prisma.transferLeg.count({
        where: {
          serviceDate: { gte: day.start, lt: new Date(day.start.getTime() + 3 * 86400000) },
          driverId: null,
          status: { in: [TransferStatus.DRAFT, TransferStatus.SCHEDULED] },
        },
      }),
      this.prisma.transferLeg.count({
        where: {
          serviceDate: { gte: day.start, lt: soon },
          pickupTimeMinutes: null,
          status: { notIn: [TransferStatus.CANCELLED, TransferStatus.COMPLETED] },
        },
      }),
      this.prisma.dataQualityIssue.count({
        where: { status: { in: [DataQualityStatus.OPEN, DataQualityStatus.REVIEWING] } },
      }),
      this.prisma.financialDocument.findMany({
        where: {
          deletedAt: null,
          status: { in: [FinancialDocumentStatus.OPEN, FinancialDocumentStatus.PARTIALLY_PAID] },
        },
        select: { totalAmount: true, dueDate: true, payments: { select: { amount: true, status: true } } },
      }),
      this.prisma.visaOrder.count({
        where: {
          deletedAt: null,
          status: { in: PENDING_VISA_STATUSES },
          serviceDate: { gte: day.start, lt: soon },
        },
      }),
    ]);

    let outstanding = 0;
    let overdue = 0;
    let dueThisWeek = 0;
    for (const doc of documents) {
      const payments = doc.payments.map((p) => ({
        amount: num(p.amount),
        status: p.status as (typeof PaymentStatus)[keyof typeof PaymentStatus],
      }));
      const balance = calculateOutstanding(num(doc.totalAmount), payments);
      if (balance <= 0.009) continue;
      outstanding += balance;
      if (doc.dueDate && doc.dueDate < day.start) overdue += balance;
      else if (doc.dueDate && doc.dueDate < soon) dueThisWeek += balance;
    }

    return {
      date: day.date,
      arrivalsToday,
      departuresToday,
      checkInsToday,
      checkOutsToday,
      transferPickupsToday: arrivalsToday + departuresToday,
      excursionsToday,
      pendingVisas,
      visasNearTravel,
      openTripFiles: openTrips,
      unassignedTransfers,
      transfersMissingPickup: missingPickups,
      openDataQualityIssues: openIssues,
      outstandingPayables: roundMoney(outstanding),
      overduePayables: roundMoney(overdue),
      paymentsDueThisWeek: roundMoney(dueThisWeek),
    };
  }

  /**
   * The chronological feed for one day, merged across every service type.
   * This is what the operations desk reads first thing in the morning.
   */
  async timeline(date?: Date): Promise<unknown> {
    const day = this.dayWindow(date);
    const inDay = { gte: day.start, lt: day.end };

    const [legs, checkIns, checkOuts, excursions] = await Promise.all([
      this.prisma.transferLeg.findMany({
        where: { serviceDate: inDay, status: { not: TransferStatus.CANCELLED } },
        orderBy: [{ pickupTimeMinutes: 'asc' }],
        include: {
          fromLocation: { select: { name: true, nameAr: true } },
          toLocation: { select: { name: true, nameAr: true } },
          driver: { select: { id: true, fullName: true, phone: true } },
          vehicle: { select: { id: true, plateNumber: true } },
          transferBooking: {
            select: {
              id: true, reference: true,
              leadTraveler: { select: { id: true, fullName: true, phoneRaw: true } },
              partner: { select: { id: true, name: true } },
              tripFile: { select: { id: true, reference: true } },
            },
          },
        },
      }),
      this.prisma.hotelStaySegment.findMany({
        where: { checkIn: inDay, hotelBooking: { deletedAt: null, status: { not: 'CANCELLED' } } },
        include: {
          hotel: { select: { id: true, name: true, nameAr: true } },
          mealPlan: { select: { code: true, name: true, nameAr: true } },
          roomAllocations: { include: { roomType: { select: { code: true, name: true, nameAr: true } } } },
          hotelBooking: {
            select: {
              id: true, reference: true, hotelRaw: true, securityApprovalRequired: true,
              hotel: { select: { id: true, name: true, nameAr: true } },
              leadTraveler: { select: { id: true, fullName: true, phoneRaw: true } },
              partner: { select: { id: true, name: true } },
              tripFile: { select: { id: true, reference: true } },
            },
          },
        },
      }),
      this.prisma.hotelStaySegment.findMany({
        where: { checkOut: inDay, hotelBooking: { deletedAt: null, status: { not: 'CANCELLED' } } },
        include: {
          hotel: { select: { id: true, name: true, nameAr: true } },
          hotelBooking: {
            select: {
              id: true, reference: true, hotelRaw: true,
              hotel: { select: { id: true, name: true, nameAr: true } },
              leadTraveler: { select: { id: true, fullName: true, phoneRaw: true } },
              partner: { select: { id: true, name: true } },
              tripFile: { select: { id: true, reference: true } },
            },
          },
        },
      }),
      this.prisma.excursionItem.findMany({
        where: { serviceDate: inDay, excursionBooking: { deletedAt: null }, status: { not: 'CANCELLED' } },
        orderBy: [{ serviceTimeMinutes: 'asc' }],
        include: {
          catalogItem: { select: { id: true, name: true, nameAr: true } },
          excursionBooking: {
            select: {
              id: true, reference: true, paxCount: true, childCount: true, hotelRaw: true,
              hotel: { select: { id: true, name: true, nameAr: true } },
              leadTraveler: { select: { id: true, fullName: true, phoneRaw: true } },
              partner: { select: { id: true, name: true } },
              tripFile: { select: { id: true, reference: true } },
            },
          },
        },
      }),
    ]);

    type Event = {
      time: string | null;
      sortKey: number;
      type: string;
      title: string;
      subtitle: string | null;
      traveler: { id: string; fullName: string; phoneRaw: string | null } | null;
      partner: { id: string; name: string } | null;
      tripFile: { id: string; reference: string } | null;
      entityType: string;
      entityId: string;
      status: string | null;
      meta: Record<string, unknown>;
    };

    const events: Event[] = [];

    for (const leg of legs) {
      const from = leg.fromLocation?.name ?? leg.fromRaw ?? '?';
      const to = leg.toLocation?.name ?? leg.toRaw ?? '?';
      events.push({
        time: hhmm(leg.pickupTimeMinutes),
        // Legs without a pickup time sort to the end of the day, not the start.
        sortKey: leg.pickupTimeMinutes ?? 24 * 60 + 1,
        type: leg.direction === 'ARRIVAL' ? 'AIRPORT_PICKUP' : leg.direction === 'DEPARTURE' ? 'AIRPORT_DROPOFF' : 'TRANSFER',
        title: `${from} → ${to}`,
        subtitle: leg.flightNumber,
        traveler: leg.transferBooking.leadTraveler,
        partner: leg.transferBooking.partner,
        tripFile: leg.transferBooking.tripFile,
        entityType: 'TransferLeg',
        entityId: leg.id,
        status: leg.status,
        meta: {
          pax: leg.paxCount,
          driver: leg.driver,
          vehicle: leg.vehicle,
          missingPickupTime: leg.pickupTimeMinutes === null,
          pickupTimeRaw: leg.pickupTimeRaw,
          securityApprovalRequired: leg.securityApprovalRequired,
          flowerBouquet: leg.flowerBouquet,
        },
      });
    }

    for (const seg of checkIns) {
      const hotel = seg.hotel?.name ?? seg.hotelBooking.hotel?.name ?? seg.hotelRaw ?? seg.hotelBooking.hotelRaw ?? 'Hotel';
      events.push({
        time: null,
        sortKey: 14 * 60,
        type: 'HOTEL_CHECK_IN',
        title: hotel,
        subtitle: seg.mealPlan?.name ?? seg.mealPlanRaw,
        traveler: seg.hotelBooking.leadTraveler,
        partner: seg.hotelBooking.partner,
        tripFile: seg.hotelBooking.tripFile,
        entityType: 'HotelStaySegment',
        entityId: seg.id,
        status: null,
        meta: {
          nights: seg.nights,
          rooms: seg.roomAllocations.map((r) => ({
            quantity: r.quantity,
            roomType: r.roomType?.name ?? r.roomTypeRaw,
          })),
          securityApprovalRequired: seg.hotelBooking.securityApprovalRequired,
        },
      });
    }

    for (const seg of checkOuts) {
      const hotel = seg.hotel?.name ?? seg.hotelBooking.hotel?.name ?? seg.hotelRaw ?? seg.hotelBooking.hotelRaw ?? 'Hotel';
      events.push({
        time: null,
        sortKey: 12 * 60,
        type: 'HOTEL_CHECK_OUT',
        title: hotel,
        subtitle: null,
        traveler: seg.hotelBooking.leadTraveler,
        partner: seg.hotelBooking.partner,
        tripFile: seg.hotelBooking.tripFile,
        entityType: 'HotelStaySegment',
        entityId: seg.id,
        status: null,
        meta: {},
      });
    }

    for (const item of excursions) {
      events.push({
        time: hhmm(item.serviceTimeMinutes),
        sortKey: item.serviceTimeMinutes ?? 9 * 60,
        type: 'EXCURSION',
        title: item.catalogItem?.name ?? item.activityRaw ?? 'Excursion',
        subtitle: item.excursionBooking.hotel?.name ?? item.excursionBooking.hotelRaw,
        traveler: item.excursionBooking.leadTraveler,
        partner: item.excursionBooking.partner,
        tripFile: item.excursionBooking.tripFile,
        entityType: 'ExcursionItem',
        entityId: item.id,
        status: item.status,
        meta: {
          pax: item.paxOverride ?? item.excursionBooking.paxCount,
          children: item.childOverride ?? item.excursionBooking.childCount,
          transferRequired: item.transferRequired,
        },
      });
    }

    return {
      date: day.date,
      events: events.sort((a, b) => a.sortKey - b.sortKey).map(({ sortKey: _s, ...e }) => e),
      counts: {
        transfers: legs.length,
        checkIns: checkIns.length,
        checkOuts: checkOuts.length,
        excursions: excursions.length,
      },
    };
  }

  /** Things that will go wrong today or this week unless someone acts. */
  async alerts(limit = 25): Promise<unknown> {
    const day = this.dayWindow();
    const soon = new Date(day.start.getTime() + 7 * 86400000);
    const threeDays = new Date(day.start.getTime() + 3 * 86400000);

    const [missingPickup, unassigned, reversedDates, pendingVisas, overdue, issues] = await Promise.all([
      this.prisma.transferLeg.findMany({
        where: {
          serviceDate: { gte: day.start, lt: soon },
          pickupTimeMinutes: null,
          status: { notIn: [TransferStatus.CANCELLED, TransferStatus.COMPLETED] },
        },
        take: limit,
        orderBy: { serviceDate: 'asc' },
        include: {
          transferBooking: { select: { reference: true, tripFile: { select: { id: true, reference: true } }, leadTraveler: { select: { fullName: true } } } },
        },
      }),
      this.prisma.transferLeg.findMany({
        where: {
          serviceDate: { gte: day.start, lt: threeDays },
          driverId: null,
          status: { in: [TransferStatus.DRAFT, TransferStatus.SCHEDULED] },
        },
        take: limit,
        orderBy: { serviceDate: 'asc' },
        include: {
          transferBooking: { select: { reference: true, tripFile: { select: { id: true, reference: true } }, leadTraveler: { select: { fullName: true } } } },
        },
      }),
      this.prisma.$queryRaw<Array<{ id: string; check_in: Date; check_out: Date; reference: string }>>`
        SELECT s.id, s."checkIn" AS check_in, s."checkOut" AS check_out, b.reference
        FROM hotel_stay_segments s
        JOIN hotel_bookings b ON b.id = s."hotelBookingId"
        WHERE b."deletedAt" IS NULL
          AND s."checkIn" IS NOT NULL AND s."checkOut" IS NOT NULL
          AND s."checkOut" < s."checkIn"
        LIMIT ${limit}
      `,
      this.prisma.visaOrder.findMany({
        where: {
          deletedAt: null,
          status: { in: PENDING_VISA_STATUSES },
          serviceDate: { gte: day.start, lt: soon },
        },
        take: limit,
        orderBy: { serviceDate: 'asc' },
        include: {
          leadTraveler: { select: { fullName: true } },
          tripFile: { select: { id: true, reference: true } },
        },
      }),
      this.prisma.financialDocument.findMany({
        where: {
          deletedAt: null,
          dueDate: { lt: day.start },
          status: { in: [FinancialDocumentStatus.OPEN, FinancialDocumentStatus.PARTIALLY_PAID] },
        },
        take: limit,
        orderBy: { dueDate: 'asc' },
        include: {
          counterparty: { select: { id: true, name: true } },
          payments: { select: { amount: true, status: true } },
        },
      }),
      this.prisma.dataQualityIssue.findMany({
        where: { status: DataQualityStatus.OPEN, severity: 'ERROR' },
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      missingPickupTime: missingPickup.map((l) => ({
        entityType: 'TransferLeg', entityId: l.id, serviceDate: l.serviceDate,
        pickupTimeRaw: l.pickupTimeRaw, reference: l.transferBooking.reference,
        traveler: l.transferBooking.leadTraveler?.fullName ?? null,
        tripFile: l.transferBooking.tripFile,
      })),
      unassignedTransfers: unassigned.map((l) => ({
        entityType: 'TransferLeg', entityId: l.id, serviceDate: l.serviceDate,
        reference: l.transferBooking.reference,
        traveler: l.transferBooking.leadTraveler?.fullName ?? null,
        tripFile: l.transferBooking.tripFile,
      })),
      checkoutBeforeCheckin: reversedDates.map((r) => ({
        entityType: 'HotelStaySegment', entityId: r.id,
        checkIn: r.check_in, checkOut: r.check_out, reference: r.reference,
      })),
      visasPendingNearTravel: pendingVisas.map((v) => ({
        entityType: 'VisaOrder', entityId: v.id, serviceDate: v.serviceDate, status: v.status,
        traveler: v.leadTraveler?.fullName ?? null, tripFile: v.tripFile,
      })),
      overduePayables: overdue.map((d) => ({
        entityType: 'FinancialDocument', entityId: d.id, reference: d.reference,
        counterparty: d.counterparty?.name ?? null, dueDate: d.dueDate,
        outstanding: calculateOutstanding(
          num(d.totalAmount),
          d.payments.map((p) => ({ amount: num(p.amount), status: p.status as (typeof PaymentStatus)[keyof typeof PaymentStatus] })),
        ),
      })),
      dataQualityErrors: issues.map((i) => ({
        entityType: 'DataQualityIssue', entityId: i.id, category: i.category,
        message: i.message, sourceSheet: i.sourceSheet, sourceRow: i.sourceRow,
      })),
    };
  }

  /** Recent meaningful activity by colleagues, for the dashboard feed. */
  async recentActivity(limit = 20): Promise<unknown> {
    return this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      where: { action: { notIn: ['USER_LOGGED_IN', 'USER_LOGGED_OUT'] } },
      include: { actor: { select: { id: true, fullName: true, email: true } } },
    });
  }

  /** Arrivals board: who is checking in, where, and on what plan. */
  async hotelArrivals(date?: Date): Promise<unknown> {
    const day = this.dayWindow(date);
    return this.prisma.hotelStaySegment.findMany({
      where: {
        checkIn: { gte: day.start, lt: day.end },
        hotelBooking: { deletedAt: null, status: { not: 'CANCELLED' } },
      },
      orderBy: { checkIn: 'asc' },
      include: {
        hotel: { select: { id: true, name: true, nameAr: true } },
        mealPlan: { select: { code: true, name: true, nameAr: true } },
        roomAllocations: { include: { roomType: { select: { code: true, name: true, nameAr: true } } } },
        hotelBooking: {
          include: {
            hotel: { select: { id: true, name: true, nameAr: true } },
            leadTraveler: { select: { id: true, fullName: true, phoneRaw: true, nationalityRaw: true } },
            partner: { select: { id: true, name: true, nameAr: true } },
            tripFile: { select: { id: true, reference: true } },
          },
        },
      },
    });
  }

  /** Upcoming transfers for the dispatch board. */
  async upcomingTransfers(date?: Date, days = 1): Promise<unknown> {
    const day = this.dayWindow(date);
    const end = new Date(day.start.getTime() + days * 86400000);
    return this.prisma.transferLeg.findMany({
      where: {
        serviceDate: { gte: day.start, lt: end },
        status: { notIn: [TransferStatus.CANCELLED, TransferStatus.COMPLETED] },
      },
      orderBy: [{ serviceDate: 'asc' }, { pickupTimeMinutes: 'asc' }],
      include: {
        fromLocation: { select: { id: true, name: true, nameAr: true } },
        toLocation: { select: { id: true, name: true, nameAr: true } },
        driver: { select: { id: true, fullName: true, phone: true } },
        vehicle: { select: { id: true, plateNumber: true, capacity: true } },
        transferBooking: {
          select: {
            id: true, reference: true, paxCount: true,
            leadTraveler: { select: { id: true, fullName: true, phoneRaw: true } },
            partner: { select: { id: true, name: true } },
            tripFile: { select: { id: true, reference: true } },
          },
        },
      },
    });
  }
}
