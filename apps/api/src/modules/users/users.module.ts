import { Body, Controller, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ROLES, type Role, type UserSummary } from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { ConflictError, DomainError, NotFoundError } from '../../common/errors';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { AuthService } from '../auth/auth.service';

class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @IsEmail() @MaxLength(255)
  email!: string;

  @IsIn(ROLES)
  role!: Role;

  @IsBoolean() @IsOptional()
  seesAllSales?: boolean;

  @IsString() @MinLength(8) @MaxLength(200)
  password!: string;
}

class UpdateUserDto {
  @IsString() @MinLength(2) @MaxLength(120) @IsOptional()
  name?: string;

  @IsEmail() @MaxLength(255) @IsOptional()
  email?: string;

  @IsIn(ROLES) @IsOptional()
  role?: Role;

  @IsBoolean() @IsOptional()
  seesAllSales?: boolean;

  @IsBoolean() @IsOptional()
  isActive?: boolean;

  /** Sets a new password for the user (an admin reset). */
  @IsString() @MinLength(8) @MaxLength(200) @IsOptional()
  password?: string;
}

const SELECT = { id: true, name: true, email: true, role: true, seesAllSales: true, isActive: true, lastLoginAt: true, createdAt: true } as const;

function toSummary(u: { id: string; name: string; email: string; role: Role; seesAllSales: boolean; isActive: boolean; lastLoginAt: Date | null; createdAt: Date }): UserSummary {
  return { ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<UserSummary[]> {
    const users = await this.prisma.user.findMany({ select: SELECT, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return users.map(toSummary);
  }

  /** Sellers for the sales form: everyone active. */
  async team(): Promise<Array<{ id: string; name: string; role: Role }>> {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateUserDto): Promise<UserSummary> {
    const email = dto.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictError('A user with this email already exists.');
    }
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        role: dto.role,
        seesAllSales: dto.role === 'SALES' && Boolean(dto.seesAllSales),
        passwordHash: await AuthService.hashPassword(dto.password),
      },
      select: SELECT,
    });
    return toSummary(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User', id);

    const demoting = (dto.role && dto.role !== 'ADMIN') || dto.isActive === false;
    if (id === actor.id && demoting) {
      throw new DomainError('CANNOT_CHANGE_OWN_ACCESS', 'You cannot remove your own admin access.', 409);
    }
    if (user.role === 'ADMIN' && demoting) {
      const admins = await this.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (admins <= 1) throw new DomainError('LAST_ADMIN', 'At least one active admin is required.', 409);
    }
    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const taken = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
      if (taken) throw new ConflictError('A user with this email already exists.');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        email: dto.email?.toLowerCase().trim(),
        role: dto.role,
        // Only a salesperson can be a sales supervisor.
        seesAllSales: (dto.role ?? user.role) === 'SALES' ? dto.seesAllSales : false,
        isActive: dto.isActive,
        passwordHash: dto.password ? await AuthService.hashPassword(dto.password) : undefined,
      },
      select: SELECT,
    });
    // Deactivating or resetting a password signs the person out everywhere.
    if (dto.isActive === false || dto.password) {
      await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return toSummary(updated);
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('team')
  team() {
    return this.users.team();
  }

  @Roles('ADMIN')
  @Get()
  list() {
    return this.users.list();
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, dto, actor);
  }
}
