import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OPEN_STATUSES, hotelPaymentDue, type DashboardData, type EntityType, type HotelBookingItem, type Status } from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { IsDateOnly, ListQueryDto } from '../../common/list';
import { todayIn } from '../../common/values';
import { HotelBookingsService } from '../ops/hotel-bookings.module';
import { TransfersService } from '../ops/transfers.module';
import { ExcursionsService } from '../ops/excursions.module';
import { VisasService } from '../ops/visas.module';
import { SalesService, SalesListQuery, sumBy, totalsByCurrency } from '../sales/sales.module';
import { baseInclude } from '../ops/ops-common';

class DashboardQuery {
  @IsIn(['today', 'tomorrow']) @IsOptional()
  day?: 'today' | 'tomorrow';
}

class ReportQuery {
  @IsDateOnly()
  from!: string;

  @IsDateOnly()
  to!: string;
}

class SearchQuery {
  @IsString() @MaxLength(100)
  q!: string;
}

const open = { in: [...OPEN_STATUSES] as Status[] };

@Injectable()
export class DashboardService {
  private readonly tz: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hotels: HotelBookingsService,
    private readonly transfers: TransfersService,
    private readonly excursions: ExcursionsService,
    private readonly visas: VisasService,
    private readonly sales: SalesService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('APP_TIMEZONE', 'Africa/Cairo');
  }

  async dashboard(day: 'today' | 'tomorrow', user: AuthUser): Promise<DashboardData> {
    const today = todayIn(this.tz);
    const target = day === 'tomorrow' ? todayIn(this.tz, 1) : today;
    const date = new Date(`${target}T00:00:00Z`);
    const live = { deletedAt: null, status: { not: 'CANCELLED' as const } };
    const hotelInclude = { ...baseInclude, hotel: { select: { id: true, name: true, city: true } } };

    const [checkIns, checkOuts, transfers, excursions, openHotels, openTransfers, openExcursions, openVisas, openSales, unassigned] =
      await Promise.all([
        this.prisma.hotelBooking.findMany({ where: { ...live, checkIn: date }, include: hotelInclude, orderBy: { guestName: 'asc' } }),
        this.prisma.hotelBooking.findMany({ where: { ...live, checkOut: date }, include: hotelInclude, orderBy: { guestName: 'asc' } }),
        this.prisma.transfer.findMany({ where: { ...live, date }, include: baseInclude, orderBy: [{ time: { sort: 'asc', nulls: 'last' } }] }),
        this.prisma.excursion.findMany({ where: { ...live, date }, include: baseInclude, orderBy: [{ time: { sort: 'asc', nulls: 'last' } }] }),
        this.prisma.hotelBooking.findMany({ where: { deletedAt: null, status: open }, include: hotelInclude, orderBy: { checkIn: { sort: 'asc', nulls: 'last' } }, take: 30 }),
        this.prisma.transfer.findMany({ where: { deletedAt: null, status: open }, include: baseInclude, orderBy: { date: { sort: 'asc', nulls: 'last' } }, take: 30 }),
        this.prisma.excursion.findMany({ where: { deletedAt: null, status: open }, include: baseInclude, orderBy: { date: { sort: 'asc', nulls: 'last' } }, take: 30 }),
        this.prisma.visa.findMany({ where: { deletedAt: null, status: open }, include: baseInclude, orderBy: { travelDate: { sort: 'asc', nulls: 'last' } }, take: 30 }),
        this.prisma.sale.count({ where: { deletedAt: null, status: open, ...this.sales.scopeFor(user) } }),
        this.prisma.transfer.count({
          where: { deletedAt: null, driverName: null, status: { notIn: ['CANCELLED', 'DONE'] }, date: { gte: new Date(`${today}T00:00:00Z`) } },
        }),
      ]);

    const [hotelOpenCount, transferOpenCount, excursionOpenCount, visaOpenCount] = await Promise.all([
      this.prisma.hotelBooking.count({ where: { deletedAt: null, status: open } }),
      this.prisma.transfer.count({ where: { deletedAt: null, status: open } }),
      this.prisma.excursion.count({ where: { deletedAt: null, status: open } }),
      this.prisma.visa.count({ where: { deletedAt: null, status: open } }),
    ]);

    type Req = DashboardData['requests'][number];
    const requests: Req[] = [
      ...openHotels.map((h) => this.hotels.toItem(h)).map((h): Req => ({
        type: 'HOTEL', id: h.id, ref: h.ref, status: h.status, title: h.guestName,
        subtitle: h.hotel?.name ?? null, date: h.checkIn, createdAt: h.createdAt,
      })),
      ...openTransfers.map((t) => this.transfers.toItem(t)).map((t): Req => ({
        type: 'TRANSFER', id: t.id, ref: t.ref, status: t.status, title: t.guestName,
        subtitle: [t.fromPlace, t.toPlace].filter(Boolean).join(' → ') || null, date: t.date, createdAt: t.createdAt,
      })),
      ...openExcursions.map((x) => this.excursions.toItem(x)).map((x): Req => ({
        type: 'EXCURSION', id: x.id, ref: x.ref, status: x.status, title: x.guestName,
        subtitle: x.activity, date: x.date, createdAt: x.createdAt,
      })),
      ...openVisas.map((v) => this.visas.toItem(v)).map((v): Req => ({
        type: 'VISA', id: v.id, ref: v.ref, status: v.status, title: v.guestName,
        subtitle: [v.fromPlace, v.toPlace].filter(Boolean).join(' → ') || null, date: v.travelDate, createdAt: v.createdAt,
      })),
    ]
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
      .slice(0, 20);

    // Hotel payments: anything late, and whatever falls due within the week.
    const weekEnd = todayIn(this.tz, 7);
    const tomorrow = todayIn(this.tz, 1);
    const due = (await this.hotels.paymentsDue()).filter((b) => (hotelPaymentDue(b) ?? '9999') <= weekEnd);
    const dueOn = (b: HotelBookingItem) => hotelPaymentDue(b) ?? '';
    const payments: DashboardData['payments'] = {
      overdue: due.filter((b) => dueOn(b) < today).length,
      today: due.filter((b) => dueOn(b) === today).length,
      tomorrow: due.filter((b) => dueOn(b) === tomorrow).length,
      items: due.slice(0, 30),
    };

    let month: DashboardData['month'] = null;
    if (user.role === 'ADMIN' || user.role === 'SALES') {
      const monthSales = await this.sales.list(
        Object.assign(new SalesListQuery(), { page: 1, pageSize: 100000, when: 'this-month', dateBy: 'sale' }),
        user,
      );
      const items = monthSales.data.filter((s) => s.status !== 'CANCELLED');
      month = {
        label: today.slice(0, 7),
        sales: items.length,
        sell: sumBy(items, (s) => s.totalSell),
        profit: sumBy(items, (s) => s.totalProfit),
        remaining: sumBy(items, (s) => s.remaining),
      };
    }

    return {
      date: today,
      day: target,
      counts: {
        checkIns: checkIns.length,
        checkOuts: checkOuts.length,
        transfers: transfers.length,
        excursions: excursions.length,
        openRequests: hotelOpenCount + transferOpenCount + excursionOpenCount + visaOpenCount,
        unassignedTransfers: unassigned,
      },
      openByType: {
        HOTEL: hotelOpenCount,
        TRANSFER: transferOpenCount,
        EXCURSION: excursionOpenCount,
        VISA: visaOpenCount,
        SALE: openSales,
      },
      checkIns: checkIns.map((h) => this.hotels.toItem(h)),
      checkOuts: checkOuts.map((h) => this.hotels.toItem(h)),
      transfers: transfers.map((t) => this.transfers.toItem(t)),
      excursions: excursions.map((x) => this.excursions.toItem(x)),
      requests,
      payments,
      month,
    };
  }

  /** Open (new + in progress) bookings per module — the badges in the menu. */
  async openCounts(user: AuthUser) {
    const where = { deletedAt: null, status: open };
    const [HOTEL, TRANSFER, EXCURSION, VISA, SALE] = await Promise.all([
      this.prisma.hotelBooking.count({ where }),
      this.prisma.transfer.count({ where }),
      this.prisma.excursion.count({ where }),
      this.prisma.visa.count({ where }),
      this.prisma.sale.count({ where: { ...where, ...this.sales.scopeFor(user) } }),
    ]);
    return { HOTEL, TRANSFER, EXCURSION, VISA, SALE };
  }

  /** The month (or any range) at a glance: sales money, and operations volume. */
  async report(from: string, to: string) {
    const range = Object.assign(new ListQueryDto(), { page: 1, pageSize: 100000, dateFrom: from, dateTo: to });
    const [sales, hotels, transfers, excursions, visas] = await Promise.all([
      this.sales.list(Object.assign(new SalesListQuery(), range, { dateBy: 'sale' })),
      this.hotels.list(Object.assign(new ListQueryDto(), range)),
      this.transfers.list(Object.assign(new ListQueryDto(), range)),
      this.excursions.list(Object.assign(new ListQueryDto(), range)),
      this.visas.list(Object.assign(new ListQueryDto(), range)),
    ]);

    const liveSales = sales.data.filter((s) => s.status !== 'CANCELLED');
    const bySeller = new Map<string, { seller: string; currency: string; count: number; totalSell: number; totalProfit: number; commission: number }>();
    for (const s of liveSales) {
      const key = `${s.seller?.id ?? '-'}|${s.currency}`;
      const row = bySeller.get(key) ?? { seller: s.seller?.name ?? '—', currency: s.currency, count: 0, totalSell: 0, totalProfit: 0, commission: 0 };
      row.count += 1;
      row.totalSell += s.totalSell;
      row.totalProfit += s.totalProfit;
      row.commission += s.commission;
      bySeller.set(key, row);
    }

    const byAgency = new Map<string, { agency: string; hotels: number; transfers: number; excursions: number; visas: number; total: number }>();
    const bump = (name: string | undefined, field: 'hotels' | 'transfers' | 'excursions' | 'visas') => {
      const key = name ?? '—';
      const row = byAgency.get(key) ?? { agency: key, hotels: 0, transfers: 0, excursions: 0, visas: 0, total: 0 };
      row[field] += 1;
      row.total += 1;
      byAgency.set(key, row);
    };
    const live = <T extends { status: Status }>(rows: T[]) => rows.filter((r) => r.status !== 'CANCELLED');
    live(hotels.data).forEach((h) => bump(h.agency?.name, 'hotels'));
    live(transfers.data).forEach((t) => bump(t.agency?.name, 'transfers'));
    live(excursions.data).forEach((x) => bump(x.agency?.name, 'excursions'));
    live(visas.data).forEach((v) => bump(v.agency?.name, 'visas'));

    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      from,
      to,
      sales: {
        totals: totalsByCurrency(liveSales),
        bySeller: [...bySeller.values()]
          .map((s) => ({ ...s, totalSell: r2(s.totalSell), totalProfit: r2(s.totalProfit), commission: r2(s.commission) }))
          .sort((a, b) => b.totalProfit - a.totalProfit),
        counts: sales.counts,
      },
      operations: {
        counts: { HOTEL: hotels.counts, TRANSFER: transfers.counts, EXCURSION: excursions.counts, VISA: visas.counts },
        hotelNights: live(hotels.data).reduce((sum, h) => sum + (h.nights ?? 0), 0),
        byAgency: [...byAgency.values()].sort((a, b) => b.total - a.total),
      },
    };
  }

  /** One box that finds any booking by name, phone, reference, hotel or flight. */
  async search(q: string, user: AuthUser) {
    const query = Object.assign(new ListQueryDto(), { q, page: 1, pageSize: 6 });
    const [sales, hotels, transfers, excursions, visas] = await Promise.all([
      this.sales.list(Object.assign(new SalesListQuery(), query), user),
      this.hotels.list(query),
      this.transfers.list(query),
      this.excursions.list(query),
      this.visas.list(query),
    ]);
    type Hit = { type: EntityType; id: string; ref: string; title: string; subtitle: string | null; date: string | null; status: Status };
    const hits: Hit[] = [
      ...sales.data.map((s): Hit => ({ type: 'SALE', id: s.id, ref: s.ref, title: s.customerName, subtitle: s.destination ?? s.hotelName, date: s.startDate, status: s.status })),
      ...hotels.data.map((h): Hit => ({ type: 'HOTEL', id: h.id, ref: h.ref, title: h.guestName, subtitle: h.hotel?.name ?? null, date: h.checkIn, status: h.status })),
      ...transfers.data.map((t): Hit => ({ type: 'TRANSFER', id: t.id, ref: t.ref, title: t.guestName, subtitle: [t.fromPlace, t.toPlace].filter(Boolean).join(' → ') || null, date: t.date, status: t.status })),
      ...excursions.data.map((x): Hit => ({ type: 'EXCURSION', id: x.id, ref: x.ref, title: x.guestName, subtitle: x.activity, date: x.date, status: x.status })),
      ...visas.data.map((v): Hit => ({ type: 'VISA', id: v.id, ref: v.ref, title: v.guestName, subtitle: [v.fromPlace, v.toPlace].filter(Boolean).join(' → ') || null, date: v.travelDate, status: v.status })),
    ];
    return hits;
  }
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller({ version: '1' })
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('dashboard')
  dashboard(@Query() q: DashboardQuery, @CurrentUser() user: AuthUser) {
    return this.service.dashboard(q.day ?? 'today', user);
  }

  @Get('dashboard/open-counts')
  openCounts(@CurrentUser() user: AuthUser) {
    return this.service.openCounts(user);
  }

  @Roles('ADMIN')
  @Get('reports/summary')
  report(@Query() q: ReportQuery) {
    return this.service.report(q.from, q.to);
  }

  @Get('search')
  search(@Query() q: SearchQuery, @CurrentUser() user: AuthUser) {
    return this.service.search(q.q, user);
  }
}
