import { Injectable } from '@nestjs/common';
import { normalizeForSearch, PERMISSIONS } from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';

export interface SearchHit {
  type: 'TRIP' | 'TRAVELER' | 'HOTEL_BOOKING' | 'TRANSFER' | 'EXCURSION' | 'VISA' | 'HOTEL' | 'PARTNER' | 'PAYABLE';
  id: string;
  title: string;
  subtitle: string | null;
  detail: string | null;
  href: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Powers the command palette.
   *
   * Results are filtered by the caller's permissions, so the palette can never
   * become a way to see records the user is not allowed to open.
   */
  async search(query: string, permissions: string[], limit = 8): Promise<SearchHit[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const norm = normalizeForSearch(q);
    const digits = q.replace(/\D/g, '');
    const can = (p: string) => permissions.includes(p);
    const hits: SearchHit[] = [];

    const tasks: Array<Promise<void>> = [];

    if (can(PERMISSIONS.TRIPS_READ)) {
      tasks.push(
        this.prisma.tripFile
          .findMany({
            where: {
              deletedAt: null,
              OR: [
                { reference: { contains: q, mode: 'insensitive' } },
                { leadTraveler: { normalizedName: { contains: norm } } },
              ],
            },
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true, reference: true, status: true,
              travelStartDate: true, travelEndDate: true,
              leadTraveler: { select: { fullName: true } },
              partner: { select: { name: true } },
            },
          })
          .then((rows) => {
            for (const t of rows) {
              hits.push({
                type: 'TRIP',
                id: t.id,
                title: t.reference,
                subtitle: t.leadTraveler?.fullName ?? null,
                detail: [t.partner?.name, t.status].filter(Boolean).join(' · '),
                href: `/trips/${t.id}`,
              });
            }
          }),
      );
    }

    if (can(PERMISSIONS.TRAVELERS_READ)) {
      tasks.push(
        this.prisma.traveler
          .findMany({
            where: {
              deletedAt: null,
              OR: [
                { normalizedName: { contains: norm } },
                ...(digits.length >= 4 ? [{ phoneDigits: { contains: digits } }] : []),
              ],
            },
            take: limit,
            select: {
              id: true, fullName: true, phoneRaw: true, nationalityRaw: true,
              nationality: { select: { name: true } },
            },
          })
          .then((rows) => {
            for (const t of rows) {
              hits.push({
                type: 'TRAVELER',
                id: t.id,
                title: t.fullName,
                subtitle: t.phoneRaw,
                detail: t.nationality?.name ?? t.nationalityRaw,
                href: `/travelers/${t.id}`,
              });
            }
          }),
      );
    }

    if (can(PERMISSIONS.TRANSFERS_READ)) {
      tasks.push(
        this.prisma.transferLeg
          .findMany({
            where: {
              OR: [
                { flightNumber: { contains: q, mode: 'insensitive' } },
                { transferBooking: { reference: { contains: q, mode: 'insensitive' } } },
              ],
            },
            take: limit,
            orderBy: { serviceDate: 'desc' },
            select: {
              id: true, flightNumber: true, serviceDate: true, fromRaw: true, toRaw: true,
              fromLocation: { select: { name: true } },
              toLocation: { select: { name: true } },
              transferBooking: {
                select: { id: true, reference: true, leadTraveler: { select: { fullName: true } } },
              },
            },
          })
          .then((rows) => {
            for (const l of rows) {
              const from = l.fromLocation?.name ?? l.fromRaw ?? '?';
              const to = l.toLocation?.name ?? l.toRaw ?? '?';
              hits.push({
                type: 'TRANSFER',
                id: l.id,
                title: `${from} → ${to}`,
                subtitle: l.transferBooking.leadTraveler?.fullName ?? l.transferBooking.reference,
                detail: [l.flightNumber, l.serviceDate?.toISOString().slice(0, 10)].filter(Boolean).join(' · '),
                href: `/transfers/${l.transferBooking.id}`,
              });
            }
          }),
      );
    }

    if (can(PERMISSIONS.HOTELS_READ)) {
      tasks.push(
        this.prisma.hotelBooking
          .findMany({
            where: {
              deletedAt: null,
              OR: [
                { reference: { contains: q, mode: 'insensitive' } },
                { confirmationNumber: { contains: q, mode: 'insensitive' } },
                { hotel: { normalizedName: { contains: norm } } },
                { hotelRaw: { contains: q, mode: 'insensitive' } },
              ],
            },
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true, reference: true, hotelRaw: true,
              hotel: { select: { name: true } },
              leadTraveler: { select: { fullName: true } },
            },
          })
          .then((rows) => {
            for (const b of rows) {
              hits.push({
                type: 'HOTEL_BOOKING',
                id: b.id,
                title: b.hotel?.name ?? b.hotelRaw ?? b.reference,
                subtitle: b.leadTraveler?.fullName ?? null,
                detail: b.reference,
                href: `/hotel-bookings/${b.id}`,
              });
            }
          }),
      );
      tasks.push(
        this.prisma.hotel
          .findMany({
            where: { deletedAt: null, normalizedName: { contains: norm } },
            take: 4,
            select: { id: true, name: true, city: true },
          })
          .then((rows) => {
            for (const h of rows) {
              hits.push({
                type: 'HOTEL', id: h.id, title: h.name, subtitle: h.city, detail: 'Hotel',
                href: `/master-data/hotels?highlight=${h.id}`,
              });
            }
          }),
      );
    }

    if (can(PERMISSIONS.EXCURSIONS_READ)) {
      tasks.push(
        this.prisma.excursionBooking
          .findMany({
            where: {
              deletedAt: null,
              OR: [
                { reference: { contains: q, mode: 'insensitive' } },
                { leadTraveler: { normalizedName: { contains: norm } } },
                { items: { some: { activityRaw: { contains: q, mode: 'insensitive' } } } },
              ],
            },
            take: limit,
            select: {
              id: true, reference: true,
              leadTraveler: { select: { fullName: true } },
              _count: { select: { items: true } },
            },
          })
          .then((rows) => {
            for (const e of rows) {
              hits.push({
                type: 'EXCURSION',
                id: e.id,
                title: e.reference,
                subtitle: e.leadTraveler?.fullName ?? null,
                detail: `${e._count.items} activities`,
                href: `/excursions/${e.id}`,
              });
            }
          }),
      );
    }

    if (can(PERMISSIONS.VISAS_READ)) {
      tasks.push(
        this.prisma.visaOrder
          .findMany({
            where: {
              deletedAt: null,
              OR: [
                { reference: { contains: q, mode: 'insensitive' } },
                { leadTraveler: { normalizedName: { contains: norm } } },
                { destinationRaw: { contains: q, mode: 'insensitive' } },
              ],
            },
            take: limit,
            select: {
              id: true, reference: true, status: true, destinationRaw: true,
              leadTraveler: { select: { fullName: true } },
            },
          })
          .then((rows) => {
            for (const v of rows) {
              hits.push({
                type: 'VISA',
                id: v.id,
                title: v.reference,
                subtitle: v.leadTraveler?.fullName ?? null,
                detail: [v.destinationRaw, v.status].filter(Boolean).join(' · '),
                href: `/visas/${v.id}`,
              });
            }
          }),
      );
    }

    if (can(PERMISSIONS.MASTER_DATA_READ)) {
      tasks.push(
        this.prisma.partner
          .findMany({
            where: { deletedAt: null, normalizedName: { contains: norm } },
            take: 4,
            select: { id: true, name: true, type: true },
          })
          .then((rows) => {
            for (const p of rows) {
              hits.push({
                type: 'PARTNER', id: p.id, title: p.name, subtitle: p.type, detail: 'Partner',
                href: `/master-data/partners?highlight=${p.id}`,
              });
            }
          }),
      );
    }

    if (can(PERMISSIONS.FINANCE_READ)) {
      tasks.push(
        this.prisma.financialDocument
          .findMany({
            where: {
              deletedAt: null,
              OR: [
                { reference: { contains: q, mode: 'insensitive' } },
                { serviceDescription: { contains: q, mode: 'insensitive' } },
              ],
            },
            take: 4,
            select: {
              id: true, reference: true, serviceDescription: true, status: true,
              counterparty: { select: { name: true } },
            },
          })
          .then((rows) => {
            for (const d of rows) {
              hits.push({
                type: 'PAYABLE',
                id: d.id,
                title: d.reference,
                subtitle: d.counterparty?.name ?? d.serviceDescription,
                detail: d.status,
                href: `/finance/payables/${d.id}`,
              });
            }
          }),
      );
    }

    await Promise.all(tasks);
    return hits;
  }
}
