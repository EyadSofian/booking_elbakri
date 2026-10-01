import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { AgencyItem, HotelItem } from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import { Roles } from '../../common/auth';
import { clean } from '../../common/values';

class AgencyDto {
  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @IsBoolean() @IsOptional()
  isDirect?: boolean;

  @IsString() @MaxLength(60) @IsOptional()
  phone?: string | null;

  @IsString() @MaxLength(1000) @IsOptional()
  notes?: string | null;
}

class UpdateAgencyDto {
  @IsString() @MinLength(1) @MaxLength(120) @IsOptional()
  name?: string;

  @IsBoolean() @IsOptional()
  isDirect?: boolean;

  @IsString() @MaxLength(60) @IsOptional()
  phone?: string | null;

  @IsString() @MaxLength(1000) @IsOptional()
  notes?: string | null;

  @IsBoolean() @IsOptional()
  isActive?: boolean;
}

class HotelDto {
  @IsString() @MinLength(1) @MaxLength(160)
  name!: string;

  @IsString() @MaxLength(80) @IsOptional()
  city?: string | null;
}

class UpdateHotelDto {
  @IsString() @MinLength(1) @MaxLength(160) @IsOptional()
  name?: string;

  @IsString() @MaxLength(80) @IsOptional()
  city?: string | null;

  @IsBoolean() @IsOptional()
  isActive?: boolean;
}

class MergeDto {
  @IsUUID()
  intoId!: string;
}

const SUGGESTION_FIELDS = ['nationality', 'mealPlan', 'rooms', 'activity', 'place', 'destination', 'serviceType', 'city', 'vehicle'] as const;
type SuggestionField = (typeof SUGGESTION_FIELDS)[number];

class SuggestQuery {
  @IsIn(SUGGESTION_FIELDS)
  field!: SuggestionField;

  @IsString() @MaxLength(100) @IsOptional()
  q?: string;
}

@Injectable()
export class LookupsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- agencies -------------------------------------------------------------

  async agencies(q?: string, includeInactive = false): Promise<AgencyItem[]> {
    const rows = await this.prisma.agency.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ isDirect: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { hotelBookings: true, transfers: true, excursions: true, visas: true } } },
    });
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      isDirect: a.isDirect,
      phone: a.phone,
      notes: a.notes,
      isActive: a.isActive,
      bookings: a._count.hotelBookings + a._count.transfers + a._count.excursions + a._count.visas,
    }));
  }

  /** Creates the agency, or returns the existing one with the same name. */
  async createAgency(dto: AgencyDto): Promise<AgencyItem> {
    const name = clean(dto.name)!;
    const existing = await this.prisma.agency.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    const agency =
      existing ??
      (await this.prisma.agency.create({
        data: { name, isDirect: dto.isDirect ?? false, phone: clean(dto.phone), notes: clean(dto.notes) },
      }));
    if (existing && !existing.isActive) {
      await this.prisma.agency.update({ where: { id: existing.id }, data: { isActive: true } });
    }
    return (await this.agencies(undefined, true)).find((a) => a.id === agency.id)!;
  }

  async updateAgency(id: string, dto: UpdateAgencyDto): Promise<AgencyItem> {
    await this.mustFindAgency(id);
    if (dto.name) {
      const clash = await this.prisma.agency.findFirst({
        where: { id: { not: id }, name: { equals: clean(dto.name)!, mode: 'insensitive' } },
      });
      if (clash) throw new ConflictError('Another agency already has this name. Merge them instead.');
    }
    await this.prisma.agency.update({
      where: { id },
      data: {
        name: dto.name ? clean(dto.name)! : undefined,
        isDirect: dto.isDirect,
        phone: clean(dto.phone),
        notes: clean(dto.notes),
        isActive: dto.isActive,
      },
    });
    return (await this.agencies(undefined, true)).find((a) => a.id === id)!;
  }

  /** Moves every booking of one agency onto another, then removes the first. */
  async mergeAgency(id: string, intoId: string): Promise<void> {
    if (id === intoId) throw new ValidationError('Choose a different agency to merge into.');
    await this.mustFindAgency(id);
    await this.mustFindAgency(intoId);
    await this.prisma.$transaction([
      this.prisma.hotelBooking.updateMany({ where: { agencyId: id }, data: { agencyId: intoId } }),
      this.prisma.transfer.updateMany({ where: { agencyId: id }, data: { agencyId: intoId } }),
      this.prisma.excursion.updateMany({ where: { agencyId: id }, data: { agencyId: intoId } }),
      this.prisma.visa.updateMany({ where: { agencyId: id }, data: { agencyId: intoId } }),
      this.prisma.agency.delete({ where: { id } }),
    ]);
  }

  async deleteAgency(id: string): Promise<void> {
    const agency = (await this.agencies(undefined, true)).find((a) => a.id === id);
    if (!agency) throw new NotFoundError('Agency', id);
    if (agency.bookings > 0) {
      throw new ConflictError('This agency has bookings. Merge it into another agency or deactivate it instead.');
    }
    await this.prisma.agency.delete({ where: { id } });
  }

  private async mustFindAgency(id: string) {
    const a = await this.prisma.agency.findUnique({ where: { id } });
    if (!a) throw new NotFoundError('Agency', id);
    return a;
  }

  // --- hotels ---------------------------------------------------------------

  async hotels(q?: string, includeInactive = false): Promise<HotelItem[]> {
    const rows = await this.prisma.hotel.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(q
          ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { city: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: { _count: { select: { bookings: true } } },
    });
    return rows.map((h) => ({ id: h.id, name: h.name, city: h.city, isActive: h.isActive, bookings: h._count.bookings }));
  }

  async createHotel(dto: HotelDto): Promise<HotelItem> {
    const name = clean(dto.name)!;
    const existing = await this.prisma.hotel.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    const hotel = existing ?? (await this.prisma.hotel.create({ data: { name, city: clean(dto.city) } }));
    if (existing && !existing.isActive) {
      await this.prisma.hotel.update({ where: { id: existing.id }, data: { isActive: true } });
    }
    return (await this.hotels(undefined, true)).find((h) => h.id === hotel.id)!;
  }

  async updateHotel(id: string, dto: UpdateHotelDto): Promise<HotelItem> {
    await this.mustFindHotel(id);
    if (dto.name) {
      const clash = await this.prisma.hotel.findFirst({
        where: { id: { not: id }, name: { equals: clean(dto.name)!, mode: 'insensitive' } },
      });
      if (clash) throw new ConflictError('Another hotel already has this name. Merge them instead.');
    }
    await this.prisma.hotel.update({
      where: { id },
      data: { name: dto.name ? clean(dto.name)! : undefined, city: clean(dto.city), isActive: dto.isActive },
    });
    return (await this.hotels(undefined, true)).find((h) => h.id === id)!;
  }

  async mergeHotel(id: string, intoId: string): Promise<void> {
    if (id === intoId) throw new ValidationError('Choose a different hotel to merge into.');
    await this.mustFindHotel(id);
    await this.mustFindHotel(intoId);
    await this.prisma.$transaction([
      this.prisma.hotelBooking.updateMany({ where: { hotelId: id }, data: { hotelId: intoId } }),
      this.prisma.hotel.delete({ where: { id } }),
    ]);
  }

  async deleteHotel(id: string): Promise<void> {
    const hotel = (await this.hotels(undefined, true)).find((h) => h.id === id);
    if (!hotel) throw new NotFoundError('Hotel', id);
    if (hotel.bookings > 0) {
      throw new ConflictError('This hotel has bookings. Merge it into another hotel or deactivate it instead.');
    }
    await this.prisma.hotel.delete({ where: { id } });
  }

  private async mustFindHotel(id: string) {
    const h = await this.prisma.hotel.findUnique({ where: { id } });
    if (!h) throw new NotFoundError('Hotel', id);
    return h;
  }

  // --- free-text suggestions -------------------------------------------------

  /**
   * Values people typed before, most used first — so "Soft All Inclusive" is
   * offered rather than retyped five different ways.
   */
  async suggestions(field: SuggestionField, q?: string): Promise<string[]> {
    const tally = new Map<string, { value: string; count: number }>();
    const add = (value: string | null, count: number) => {
      if (!value) return;
      const key = value.toLowerCase();
      const hit = tally.get(key);
      if (hit) hit.count += count;
      else tally.set(key, { value, count });
    };
    const live = { deletedAt: null };
    const like = (col: string) => (q ? { [col]: { contains: q, mode: 'insensitive' as const } } : { [col]: { not: null } });

    switch (field) {
      case 'nationality': {
        const sets = await Promise.all([
          this.prisma.hotelBooking.groupBy({ by: ['nationality'], where: { ...live, ...like('nationality') }, _count: { _all: true } }),
          this.prisma.transfer.groupBy({ by: ['nationality'], where: { ...live, ...like('nationality') }, _count: { _all: true } }),
          this.prisma.excursion.groupBy({ by: ['nationality'], where: { ...live, ...like('nationality') }, _count: { _all: true } }),
          this.prisma.visa.groupBy({ by: ['nationality'], where: { ...live, ...like('nationality') }, _count: { _all: true } }),
          this.prisma.sale.groupBy({ by: ['nationality'], where: { ...live, ...like('nationality') }, _count: { _all: true } }),
        ]);
        for (const set of sets) for (const g of set) add(g.nationality, g._count._all);
        break;
      }
      case 'mealPlan':
        for (const g of await this.prisma.hotelBooking.groupBy({ by: ['mealPlan'], where: { ...live, ...like('mealPlan') }, _count: { _all: true } })) add(g.mealPlan, g._count._all);
        break;
      case 'rooms':
        for (const g of await this.prisma.hotelBooking.groupBy({ by: ['rooms'], where: { ...live, ...like('rooms') }, _count: { _all: true } })) add(g.rooms, g._count._all);
        break;
      case 'activity':
        for (const g of await this.prisma.excursion.groupBy({ by: ['activity'], where: { ...live, ...like('activity') }, _count: { _all: true } })) add(g.activity, g._count._all);
        break;
      case 'place': {
        const [from, to] = await Promise.all([
          this.prisma.transfer.groupBy({ by: ['fromPlace'], where: { ...live, ...like('fromPlace') }, _count: { _all: true } }),
          this.prisma.transfer.groupBy({ by: ['toPlace'], where: { ...live, ...like('toPlace') }, _count: { _all: true } }),
        ]);
        for (const g of from) add(g.fromPlace, g._count._all);
        for (const g of to) add(g.toPlace, g._count._all);
        break;
      }
      case 'destination':
        for (const g of await this.prisma.sale.groupBy({ by: ['destination'], where: { ...live, ...like('destination') }, _count: { _all: true } })) add(g.destination, g._count._all);
        break;
      case 'serviceType':
        for (const g of await this.prisma.saleLine.groupBy({
          by: ['title'],
          where: { kind: 'SERVICE', sale: live, ...like('title') },
          _count: { _all: true },
        })) add(g.title, g._count._all);
        break;
      case 'city':
        for (const g of await this.prisma.hotel.groupBy({ by: ['city'], where: like('city'), _count: { _all: true } })) add(g.city, g._count._all);
        break;
      case 'vehicle':
        for (const g of await this.prisma.transfer.groupBy({ by: ['vehicle'], where: { ...live, ...like('vehicle') }, _count: { _all: true } })) add(g.vehicle, g._count._all);
        break;
    }
    return [...tally.values()].sort((a, b) => b.count - a.count).slice(0, 25).map((t) => t.value);
  }
}

@ApiTags('lookups')
@ApiBearerAuth()
@Controller({ path: 'lookups', version: '1' })
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get('agencies')
  agencies(@Query('q') q?: string, @Query('all') all?: string) {
    return this.lookups.agencies(q, all === '1' || all === 'true');
  }

  @Post('agencies')
  createAgency(@Body() dto: AgencyDto) {
    return this.lookups.createAgency(dto);
  }

  @Roles('OPERATIONS')
  @Patch('agencies/:id')
  updateAgency(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAgencyDto) {
    return this.lookups.updateAgency(id, dto);
  }

  @Roles('OPERATIONS')
  @Post('agencies/:id/merge')
  @HttpCode(204)
  mergeAgency(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MergeDto) {
    return this.lookups.mergeAgency(id, dto.intoId);
  }

  @Roles('OPERATIONS')
  @Delete('agencies/:id')
  @HttpCode(204)
  deleteAgency(@Param('id', ParseUUIDPipe) id: string) {
    return this.lookups.deleteAgency(id);
  }

  @Get('hotels')
  hotels(@Query('q') q?: string, @Query('all') all?: string) {
    return this.lookups.hotels(q, all === '1' || all === 'true');
  }

  @Post('hotels')
  createHotel(@Body() dto: HotelDto) {
    return this.lookups.createHotel(dto);
  }

  @Roles('OPERATIONS')
  @Patch('hotels/:id')
  updateHotel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHotelDto) {
    return this.lookups.updateHotel(id, dto);
  }

  @Roles('OPERATIONS')
  @Post('hotels/:id/merge')
  @HttpCode(204)
  mergeHotel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MergeDto) {
    return this.lookups.mergeHotel(id, dto.intoId);
  }

  @Roles('OPERATIONS')
  @Delete('hotels/:id')
  @HttpCode(204)
  deleteHotel(@Param('id', ParseUUIDPipe) id: string) {
    return this.lookups.deleteHotel(id);
  }

  @Get('suggestions')
  suggestions(@Query() query: SuggestQuery) {
    return this.lookups.suggestions(query.field, query.q);
  }
}
