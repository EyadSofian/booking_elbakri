/**
 * Sets up a fresh database: the first admin and ELBAKRI's own "agency" for
 * direct customers. Safe to run again — nothing is duplicated or overwritten.
 *
 *   npm run seed -w @elbakri/api
 *
 * SEED_DEMO=true adds a few clearly fictional sales and bookings to look at.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding ELBAKRI OVERSEAS bookings database...');

  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@elbakri.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`  admin: ${email} (already present)`);
  } else {
    if (!password || password.length < 8) {
      throw new Error('Set SEED_ADMIN_PASSWORD (at least 8 characters) to create the first admin.');
    }
    await prisma.user.create({
      data: {
        email,
        name: 'Admin',
        role: 'ADMIN',
        passwordHash: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      },
    });
    console.log(`  admin: ${email}`);
  }

  const direct = await prisma.agency.findFirst({ where: { isDirect: true } });
  if (!direct) {
    await prisma.agency.upsert({
      where: { name: 'ELBAKRI OVERSEAS' },
      create: { name: 'ELBAKRI OVERSEAS', isDirect: true, notes: 'Our own customers' },
      update: { isDirect: true },
    });
  }
  console.log('  direct agency: ELBAKRI OVERSEAS');

  if (process.env.SEED_DEMO === 'true') {
    if (process.env.NODE_ENV === 'production') throw new Error('Demo data is not allowed in production.');
    await demo();
  }
  console.log('Seed complete.');
}

async function demo(): Promise<void> {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
  const day = (offset: number) => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + offset);
    return d;
  };
  if (await prisma.sale.count({ where: { notes: { contains: '[demo]' } } })) {
    console.log('  demo data: already present');
    return;
  }
  await prisma.sale.create({
    data: {
      status: 'CONFIRMED',
      saleDate: day(0),
      customerName: 'Demo Customer',
      nationality: 'Egyptian',
      phone: '+201000000000',
      destination: 'Sharm El Sheikh',
      hotelName: 'Demo Resort',
      adults: 2,
      doubleRooms: 1,
      startDate: day(3),
      endDate: day(7),
      hotelCost: 20000,
      hotelSell: 24000,
      transferDetails: 'Airport ↔ hotel',
      transferCost: 800,
      transferSell: 1200,
      sellerId: admin.id,
      createdById: admin.id,
      notes: '[demo] fictional record',
      payments: { create: { amount: 10000, paidOn: day(0), method: 'CASH', createdById: admin.id } },
    },
  });
  console.log('  demo data: 1 sale');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
