/**
 * Development seed.
 *
 * Creates the permission catalogue, the system roles, a first Super Admin, and
 * the master data (hotels, agencies, room types, meal plans, locations,
 * excursions, nationalities) with the alias spellings observed in the legacy
 * workbooks, so the importer can resolve most values without review.
 *
 * Demo trip files are fictional. Real customer and financial data is never
 * seeded — the supplied workbooks are migration inputs, not repository content.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, normalizeAliasKey, normalizeForSearch,
  PERMISSION_GROUPS, SYSTEM_ROLES, type Permission, type SystemRole,
} from '../../../packages/shared/src';

const prisma = new PrismaClient();

const ROLE_LABELS: Record<SystemRole, { name: string; nameAr: string; description: string }> = {
  SUPER_ADMIN: { name: 'Super Admin', nameAr: 'مدير النظام', description: 'Full access, including role and API key management.' },
  ADMIN: { name: 'Administrator', nameAr: 'مسؤول', description: 'Full operational and administrative access.' },
  OPERATIONS_MANAGER: { name: 'Operations Manager', nameAr: 'مدير العمليات', description: 'Runs day-to-day operations across every service.' },
  RESERVATION_AGENT: { name: 'Reservation Agent', nameAr: 'موظف حجوزات', description: 'Creates and maintains hotel bookings and trip files.' },
  TRANSFER_COORDINATOR: { name: 'Transfer Coordinator', nameAr: 'منسق النقل', description: 'Dispatches transfers and assigns drivers.' },
  EXCURSION_COORDINATOR: { name: 'Excursion Coordinator', nameAr: 'منسق الرحلات', description: 'Manages excursion orders and the daily activity board.' },
  VISA_AGENT: { name: 'Visa Agent', nameAr: 'موظف تأشيرات', description: 'Handles visa applications and their documents.' },
  FINANCE: { name: 'Finance', nameAr: 'الحسابات', description: 'Payables, payments, settlements and reconciliation.' },
  VIEWER: { name: 'Viewer', nameAr: 'مشاهد', description: 'Read-only access to operational records.' },
};

function groupOf(permission: string): string {
  for (const [group, list] of Object.entries(PERMISSION_GROUPS)) {
    if ((list as string[]).includes(permission)) return group;
  }
  return 'other';
}

async function seedPermissionsAndRoles(): Promise<void> {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, groupKey: groupOf(key) },
      update: { groupKey: groupOf(key) },
    });
  }
  console.log(`  permissions: ${ALL_PERMISSIONS.length}`);

  const permissionsByKey = new Map(
    (await prisma.permission.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]),
  );

  for (const [roleKey, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS) as Array<[SystemRole, Permission[]]>) {
    const labels = ROLE_LABELS[roleKey];
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      create: { key: roleKey, name: labels.name, nameAr: labels.nameAr, description: labels.description, isSystem: true },
      update: { name: labels.name, nameAr: labels.nameAr, description: labels.description },
      select: { id: true },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const key of permissions) {
      const permissionId = permissionsByKey.get(key);
      if (permissionId) {
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId } });
      }
    }
  }
  console.log(`  roles: ${Object.keys(DEFAULT_ROLE_PERMISSIONS).length}`);
}

async function seedAdmin(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@elbakri.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026Elbakri';

  const superAdmin = await prisma.role.findUnique({ where: { key: SYSTEM_ROLES.SUPER_ADMIN }, select: { id: true } });
  if (!superAdmin) throw new Error('Super Admin role was not created.');

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    console.log(`  admin: ${email} (already present)`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      fullName: 'System Administrator',
      normalizedName: normalizeForSearch('System Administrator'),
      locale: 'en',
    },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: superAdmin.id } });
  console.log(`  admin: ${email}`);
}

/**
 * Master data with the alias spellings seen in the legacy workbooks.
 *
 * These aliases are what let the importer resolve "SAMA TOURS", "sama" and
 * "Sama" onto one partner deterministically, instead of guessing by similarity.
 */
const PARTNERS: Array<{ name: string; nameAr?: string; type?: string; aliases: string[] }> = [
  {
    name: 'ELBAKRI OVERSEAS', nameAr: 'البكري اوفرسيز', type: 'INTERNAL',
    aliases: [
      'elbakri', 'ELBAKRI', 'Elbakri', 'ELBKRI', 'elbakri overseas', 'elbakrioverseas',
      'ELBAKRI OVER SEAS', 'ELBAKRIOVER ESAS', 'albakri overseas',
      'البكري اوفرسيز', 'البكري اوفر سيز', 'البكرى اوفر سيز', 'البكرى اوفرسيز',
    ],
  },
  { name: 'SAMA', nameAr: 'سما', aliases: ['SAMA TOURS', 'sama tours', 'sama  tours', 'Sama', 'sama', 'SAM', 'samah'] },
  { name: 'YELLOW', aliases: ['YELOW', 'yelow', 'Yelow', 'yellow'] },
  { name: 'TAZKARA', aliases: ['tazkra', 'Tazkra', 'tazkara', 'Tazkara', 'tazkarta'] },
  { name: 'SKY', aliases: ['sky'] },
  { name: 'DISCOVERY', aliases: ['discovery', 'dis covery'] },
  { name: 'SOFINA', aliases: ['sofina'] },
  { name: 'FREEDOM', aliases: ['free', 'freedom'] },
  { name: 'SISI', aliases: ['sisi'] },
];

const HOTELS: Array<{ name: string; city?: string; aliases: string[] }> = [
  { name: 'Jaz Sharm Dreams', city: 'Sharm El Sheikh', aliases: ['JAZ SHARM DREAMS', 'JAS SHARM DREAMS', 'HAZ SHARM DREAMS', 'jaz sharm dreams'] },
  { name: 'Pickalbatros Laguna Club', city: 'Sharm El Sheikh', aliases: ['albatros laguna club', 'ALBATROS LAGUNA', 'pickalbatros laguna club', 'albatros laguna'] },
  { name: 'Rixos Radamis', city: 'Sharm El Sheikh', aliases: ['rixos radamis', 'RIXOS RADAMIS'] },
  { name: 'Rixos Seagate', city: 'Sharm El Sheikh', aliases: ['rixos seagates', 'RIXOS SEAGATES', 'rixos seagate'] },
  { name: 'Rixos Magawish', city: 'Hurghada', aliases: ['rixos magawish'] },
  { name: 'Rixos Alamein', city: 'Alamein', aliases: ['rixos alalamin', 'rixos al alamein'] },
  { name: 'Sunrise Tucana', city: 'Hurghada', aliases: ['sunrise tucana', 'صن رايز تانكو'] },
  { name: 'Sunrise Anjum', city: 'Hurghada', aliases: ['sunrise anjum', 'SUNRISE ANJUM'] },
  { name: 'Sunrise Arabian Beach', city: 'Sharm El Sheikh', aliases: ['SUNRISE ARABIAN', 'sunrise arabian'] },
  { name: 'Sunrise Alma Bay', city: 'Hurghada', aliases: ['sunrise alma bay'] },
  { name: 'White Hills', city: 'Sharm El Sheikh', aliases: ['white hills', 'وايـت هيلــز', 'وايت هيلز'] },
  { name: 'Safir Waterfalls', city: 'Sharm El Sheikh', aliases: ['safir waterfalls', 'SAFIR WATERFALLS'] },
  { name: 'Safir Hotel', city: 'Sharm El Sheikh', aliases: ['SAFIR HOTEL'] },
  { name: 'Swissotel', city: 'Sharm El Sheikh', aliases: ['swissotel', 'SWISSOTEL'] },
  { name: 'Stella Di Mare', city: 'Sharm El Sheikh', aliases: ['stella di mare'] },
  { name: 'Novotel Palm', city: 'Sharm El Sheikh', aliases: ['NOVOTEL PALM', 'novotel palm'] },
  { name: 'Novotel Beach', city: 'Sharm El Sheikh', aliases: ['NOVOTEL BEACH', 'NOVOTEL', 'novotel'] },
  { name: 'Rehana Aqua', city: 'Sharm El Sheikh', aliases: ['REHANA AQUA'] },
  { name: 'Jaz Dahabeya', city: 'Sharm El Sheikh', aliases: ['JAZ DAHBYA'] },
  { name: 'Ganet Sinai', city: 'Sharm El Sheikh', aliases: ['GANET SAINA'] },
  { name: 'Amwaj Oyoun', city: 'Sharm El Sheikh', aliases: ['AMWAJ OYOUN', 'amwaj oyoun', 'Amwaj Oyoun'] },
  { name: 'Albatros Palace', city: 'Hurghada', aliases: ['ALBATROS PALACE', 'Albatros Palace'] },
  { name: 'Albatros Aqua Blu', city: 'Sharm El Sheikh', aliases: ['albatros aqua blu'] },
  { name: 'Albatros Moderna', city: 'Sharm El Sheikh', aliases: ['albatros moderna'] },
  { name: 'Albatros Makadi', city: 'Hurghada', aliases: ['albatros makadi'] },
  { name: 'Laguna Vista', city: 'Sharm El Sheikh', aliases: ['laguna vista', 'albatros laguna vista'] },
  { name: 'Marlin Inn', city: 'Hurghada', aliases: ['marlin in', 'marlin inn'] },
  { name: 'AMC Royal', city: 'Hurghada', aliases: ['amc royal'] },
  { name: 'Le Reve', city: 'Hurghada', aliases: ['le reve'] },
  { name: 'The Grand Hotel', city: 'Sharm El Sheikh', aliases: ['THE GRAND HOTEL', 'the grand hotel'] },
  { name: 'Panorama Naama', city: 'Sharm El Sheikh', aliases: ['PANORMAMA NAAMA', 'PANORAMA', 'panorama naama'] },
  { name: 'Jaz Mirabel', city: 'Sharm El Sheikh', aliases: ['JAZ MIRABEL'] },
  { name: 'Sharm Plaza', city: 'Sharm El Sheikh', aliases: ['SHARM PLAZA'] },
  { name: 'El Khan Sharm', city: 'Sharm El Sheikh', aliases: ['ELKHAN SHRAM', 'el khan sharm'] },
  { name: 'Grand Oasis', city: 'Sharm El Sheikh', aliases: ['grand oasis'] },
  { name: 'Verginia Sharm', city: 'Sharm El Sheikh', aliases: ['verginia sharm'] },
  { name: 'Steigenberger Golf', city: 'Sharm El Sheikh', aliases: ['STEIGENBERGER GOLF'] },
  { name: 'Marina Wadi Degla', city: 'Ain Sokhna', aliases: ['marina wadi degla'] },
  { name: 'Ramses Hilton', city: 'Cairo', aliases: ['ramses hilton'] },
  { name: 'Obelisk Nile Tower', city: 'Cairo', aliases: ['obelisk nile tower'] },
  { name: 'Royal Viking', city: 'Luxor', aliases: ['royal viking'] },
  { name: 'Azal Pyramids', city: 'Cairo', aliases: ['azal pyramids'] },
  { name: 'Cascades', city: 'Soma Bay', aliases: ['cascades'] },
  { name: 'Sataya', city: 'Marsa Alam', aliases: ['SATAYA'] },
  { name: 'Xanadu Makadi', city: 'Hurghada', aliases: ['xandumakadi', 'xanadu makadi'] },
  { name: 'Dyarna', city: 'Dahab', aliases: ['dyarna'] },
  { name: 'Sultan Hassan', city: 'Cairo', aliases: ['sultan hassan'] },
  { name: 'Tivoli Hotel Aqua Park', city: 'Sharm El Sheikh', aliases: ['Tivoli Hotel Aqua park'] },
  { name: 'Jungle Aqua Park', city: 'Hurghada', aliases: ['JUNGEL AQUA PARK'] },
];

const ROOM_TYPES: Array<{ code: string; name: string; nameAr?: string; capacity?: number; aliases: string[] }> = [
  { code: 'SGL', name: 'Single Room', nameAr: 'غرفة مفردة', capacity: 1, aliases: ['single', 'SINGLE', 'sgl', 'single room'] },
  { code: 'DBL', name: 'Double Room', nameAr: 'غرفة مزدوجة', capacity: 2, aliases: ['double', 'DOUBLE', 'dbl', 'double room', 'DOUBLE ROOM', 'ستاندرا  دبل', 'standard double'] },
  { code: 'TWN', name: 'Twin Room', nameAr: 'غرفة توأم', capacity: 2, aliases: ['twin', 'twin room'] },
  { code: 'TPL', name: 'Triple Room', nameAr: 'غرفة ثلاثية', capacity: 3, aliases: ['triple', 'triple room', 'TRIPLE ROOM', 'tpl'] },
  { code: 'QUAD', name: 'Quad Room', capacity: 4, aliases: ['quad', 'quad room'] },
  { code: 'FAMILY', name: 'Family Room', nameAr: 'غرفة عائلية', capacity: 4, aliases: ['family', 'family room', 'FAMILY ROOM'] },
  { code: 'SUITE', name: 'Suite', nameAr: 'جناح', aliases: ['suite'] },
  { code: 'SUPERIOR', name: 'Superior Room', aliases: ['superior', 'superior room', 'سوبيرم روم دبل'] },
];

const MEAL_PLANS: Array<{ code: string; name: string; nameAr?: string; aliases: string[] }> = [
  { code: 'BO', name: 'Bed Only', nameAr: 'سرير فقط', aliases: ['bo', 'bed only', 'room only', 'ro'] },
  { code: 'BB', name: 'Bed & Breakfast', nameAr: 'مبيت وإفطار', aliases: ['bb', 'BB', 'b.b', 'B.B', 'B>B', 'bed and breakfast'] },
  { code: 'HB', name: 'Half Board', nameAr: 'نصف إقامة', aliases: ['hb', 'HB', 'H ,B', 'half board', 'HALF BOARD', 'half borad'] },
  { code: 'FB', name: 'Full Board', nameAr: 'إقامة كاملة', aliases: ['fb', 'full board', 'FULL BOARD', 'full borad'] },
  { code: 'SAI', name: 'Soft All Inclusive', nameAr: 'سوفت أول إنكلوسيف', aliases: ['soft', 'sal', 'SAL', 'SAI', 'soft all', 'SOFT ALL', 'soft all inclusive', 'سـوفت اول انكلوسيف'] },
  { code: 'AI', name: 'All Inclusive', nameAr: 'شامل كل شيء', aliases: ['all', 'ALL', 'All', 'al', 'all inclusive', 'all incluisve'] },
  { code: 'UAI', name: 'Ultra All Inclusive', nameAr: 'ألترا أول إنكلوسيف', aliases: ['ultra all inclusive', 'uai', 'ultra'] },
];

const LOCATIONS: Array<{ name: string; kind: string; city?: string; iataCode?: string; aliases: string[] }> = [
  { name: 'Sharm El Sheikh Airport', kind: 'AIRPORT', city: 'Sharm El Sheikh', iataCode: 'SSH', aliases: ['AIRPORT SHARM', 'SHARM AIRPORT', 'SSH AIRPORT', 'airport sharm', 'sharm airport', 'AIRPORT', 'airport'] },
  { name: 'Hurghada Airport', kind: 'AIRPORT', city: 'Hurghada', iataCode: 'HRG', aliases: ['HURGHADA AIRPORT', 'HRG AIRPORT', 'airport hurghada'] },
  { name: 'Cairo Airport', kind: 'AIRPORT', city: 'Cairo', iataCode: 'CAI', aliases: ['CAIRO AIRPORT', 'CAI AIRPORT'] },
  { name: 'Naama Bay', kind: 'AREA', city: 'Sharm El Sheikh', aliases: ['naama bay', 'NAAMA BAY'] },
  { name: 'Dahab', kind: 'CITY', city: 'Dahab', aliases: ['DAHAB', 'dahab'] },
  { name: 'Cairo', kind: 'CITY', city: 'Cairo', aliases: ['CAIRO', 'cairo'] },
  { name: 'Beirut', kind: 'CITY', aliases: ['BEURIT', 'BEIRUT', 'beirut', 'beurit'] },
];

const EXCURSIONS: Array<{ code: string; name: string; nameAr?: string; category?: string; aliases: string[] }> = [
  { code: 'RAS_MOHAMED', name: 'Ras Mohamed', nameAr: 'رأس محمد', category: 'BOAT', aliases: ['RAS MOHAMED', 'ras mohamed', '5 RAS MOHAMED'] },
  { code: 'SAFARI', name: 'Desert Safari', nameAr: 'سفاري صحراوي', category: 'DESERT', aliases: ['SAFARI', 'safari', 'SAFRI', 'SAFARI DBL', 'SAFRI DBL', 'SAFARI DBL &SNG'] },
  { code: 'PARASAILING', name: 'Parasailing', nameAr: 'باراسيلينج', category: 'WATERSPORT', aliases: ['PARASAILING', 'PARASAILLING', 'PARCELING', 'parasailing', 'PARASAILING DBL', 'PARASAILLING DBL'] },
  { code: 'GLASS_BOAT', name: 'Glass Boat', nameAr: 'القارب الزجاجي', category: 'BOAT', aliases: ['GLASS BOAT', 'glass boat'] },
  { code: 'DBL_MOTOR', name: 'Double Motor', category: 'WATERSPORT', aliases: ['DBL MOTOR', 'double motor'] },
  { code: 'BUGGY', name: 'Buggy Car', nameAr: 'عربة الباجي', category: 'DESERT', aliases: ['BUGGY CAR', 'BUGGY CAR DBL', 'buggy'] },
  { code: 'CITY_TOUR', name: 'City Tour', nameAr: 'جولة في المدينة', category: 'TOUR', aliases: ['CITY TOUR', 'city tour', 'city tour (evening )', 'CITY TOUR + P DBL'] },
  { code: 'AQUA_PARK', name: 'Aqua Park', nameAr: 'الحديقة المائية', category: 'PARK', aliases: ['AQUA PARK', 'aqua park'] },
  { code: 'FARSHA', name: 'Farsha Cafe', category: 'TOUR', aliases: ['FARSHA CAFE', 'farsha'] },
  { code: 'NIGHT_BOAT', name: 'Night Boat', category: 'BOAT', aliases: ['NIGHT BOAT', 'night boat', '5 NIGHTS BOAT'] },
  { code: 'DAHAB_TRIP', name: 'Dahab Trip', nameAr: 'رحلة دهب', category: 'TOUR', aliases: ['DAHAB', 'dahab trip'] },
];

const NATIONALITIES: Array<{ code: string; name: string; nameAr: string; aliases: string[] }> = [
  { code: 'EG', name: 'Egyptian', nameAr: 'مصري', aliases: ['egy', 'EGY', 'Egy', 'eg', 'egyt', 'egyptian', 'مصرى', 'مصري'] },
  { code: 'LB', name: 'Lebanese', nameAr: 'لبناني', aliases: ['leb', 'LEB', 'Leb', 'lebanese', 'LEBANESE', 'lebanse', 'lebanes'] },
  { code: 'DZ', name: 'Algerian', nameAr: 'جزائري', aliases: ['alg', 'Alg', 'algerian', 'Algerian', 'ALGERIENNE', 'ALAGERIA', 'ALGERIA'] },
  { code: 'SA', name: 'Saudi', nameAr: 'سعودي', aliases: ['saudi', 'Saudi', 'SAUDI'] },
  { code: 'YE', name: 'Yemeni', nameAr: 'يمني', aliases: ['yamen', 'yemeni', 'Yemeni', 'yaman'] },
  { code: 'IQ', name: 'Iraqi', nameAr: 'عراقي', aliases: ['iraq', 'iraqi'] },
  { code: 'LY', name: 'Libyan', nameAr: 'ليبي', aliases: ['libyan', 'libya'] },
  { code: 'JO', name: 'Jordanian', nameAr: 'أردني', aliases: ['jord', 'jordanian'] },
  { code: 'PS', name: 'Palestinian', nameAr: 'فلسطيني', aliases: ['palstine', 'palestinian'] },
  { code: 'MA', name: 'Moroccan', nameAr: 'مغربي', aliases: ['morroco', 'moroco', 'moroccan'] },
  { code: 'AE', name: 'Emirati', nameAr: 'إماراتي', aliases: ['emirites', 'emirati', 'uae'] },
  { code: 'TR', name: 'Turkish', nameAr: 'تركي', aliases: ['turkish', 'turkey'] },
  { code: 'IT', name: 'Italian', nameAr: 'إيطالي', aliases: ['italian', 'italy'] },
  { code: 'CN', name: 'Chinese', nameAr: 'صيني', aliases: ['chinese', 'china'] },
  { code: 'DO', name: 'Dominican', nameAr: 'دومينيكي', aliases: ['dominican'] },
  { code: 'FR', name: 'French', nameAr: 'فرنسي', aliases: ['french', 'france'] },
];

async function seedMasterData(): Promise<void> {
  for (const p of PARTNERS) {
    const partner = await prisma.partner.upsert({
      where: { normalizedName: normalizeForSearch(p.name) },
      create: { name: p.name, nameAr: p.nameAr ?? null, normalizedName: normalizeForSearch(p.name), type: p.type ?? 'TRAVEL_AGENCY' },
      update: { nameAr: p.nameAr ?? undefined },
      select: { id: true },
    });
    for (const alias of p.aliases) {
      const aliasKey = normalizeAliasKey(alias);
      if (!aliasKey) continue;
      await prisma.partnerAlias.upsert({
        where: { aliasKey_partnerId: { aliasKey, partnerId: partner.id } },
        create: { partnerId: partner.id, alias, aliasKey, source: 'SEED' },
        update: {},
      });
    }
  }
  console.log(`  partners: ${PARTNERS.length}`);

  for (const h of HOTELS) {
    const hotel = await prisma.hotel.upsert({
      where: { normalizedName: normalizeForSearch(h.name) },
      create: { name: h.name, normalizedName: normalizeForSearch(h.name), city: h.city ?? null },
      update: { city: h.city ?? undefined },
      select: { id: true },
    });
    for (const alias of h.aliases) {
      const aliasKey = normalizeAliasKey(alias);
      if (!aliasKey) continue;
      await prisma.hotelAlias.upsert({
        where: { aliasKey_hotelId: { aliasKey, hotelId: hotel.id } },
        create: { hotelId: hotel.id, alias, aliasKey, source: 'SEED' },
        update: {},
      });
    }
  }
  console.log(`  hotels: ${HOTELS.length}`);

  for (const r of ROOM_TYPES) {
    const roomType = await prisma.roomType.upsert({
      where: { code: r.code },
      create: { code: r.code, name: r.name, nameAr: r.nameAr ?? null, normalizedName: normalizeForSearch(r.name), capacity: r.capacity ?? null },
      update: { name: r.name, nameAr: r.nameAr ?? undefined },
      select: { id: true },
    });
    for (const alias of r.aliases) {
      const aliasKey = normalizeAliasKey(alias);
      if (!aliasKey) continue;
      await prisma.roomTypeAlias.upsert({
        where: { aliasKey_roomTypeId: { aliasKey, roomTypeId: roomType.id } },
        create: { roomTypeId: roomType.id, alias, aliasKey },
        update: {},
      });
    }
  }
  console.log(`  room types: ${ROOM_TYPES.length}`);

  for (const m of MEAL_PLANS) {
    const mealPlan = await prisma.mealPlan.upsert({
      where: { code: m.code },
      create: { code: m.code, name: m.name, nameAr: m.nameAr ?? null, normalizedName: normalizeForSearch(m.name) },
      update: { name: m.name, nameAr: m.nameAr ?? undefined },
      select: { id: true },
    });
    for (const alias of m.aliases) {
      const aliasKey = normalizeAliasKey(alias);
      if (!aliasKey) continue;
      await prisma.mealPlanAlias.upsert({
        where: { aliasKey_mealPlanId: { aliasKey, mealPlanId: mealPlan.id } },
        create: { mealPlanId: mealPlan.id, alias, aliasKey },
        update: {},
      });
    }
  }
  console.log(`  meal plans: ${MEAL_PLANS.length}`);

  for (const l of LOCATIONS) {
    const location = await prisma.location.upsert({
      where: { normalizedName: normalizeForSearch(l.name) },
      create: { name: l.name, normalizedName: normalizeForSearch(l.name), kind: l.kind, city: l.city ?? null, iataCode: l.iataCode ?? null },
      update: { kind: l.kind },
      select: { id: true },
    });
    for (const alias of l.aliases) {
      const aliasKey = normalizeAliasKey(alias);
      if (!aliasKey) continue;
      await prisma.locationAlias.upsert({
        where: { aliasKey_locationId: { aliasKey, locationId: location.id } },
        create: { locationId: location.id, alias, aliasKey },
        update: {},
      });
    }
  }
  console.log(`  locations: ${LOCATIONS.length}`);

  for (const e of EXCURSIONS) {
    const item = await prisma.excursionCatalogItem.upsert({
      where: { code: e.code },
      create: { code: e.code, name: e.name, nameAr: e.nameAr ?? null, normalizedName: normalizeForSearch(e.name), category: e.category ?? null },
      update: { name: e.name, nameAr: e.nameAr ?? undefined },
      select: { id: true },
    });
    for (const alias of e.aliases) {
      const aliasKey = normalizeAliasKey(alias);
      if (!aliasKey) continue;
      await prisma.excursionAlias.upsert({
        where: { aliasKey_catalogItemId: { aliasKey, catalogItemId: item.id } },
        create: { catalogItemId: item.id, alias, aliasKey },
        update: {},
      });
    }
  }
  console.log(`  excursions: ${EXCURSIONS.length}`);

  for (const n of NATIONALITIES) {
    const nationality = await prisma.nationality.upsert({
      where: { code: n.code },
      create: { code: n.code, name: n.name, nameAr: n.nameAr, normalizedName: normalizeForSearch(n.name) },
      update: { name: n.name, nameAr: n.nameAr },
      select: { id: true },
    });
    for (const alias of n.aliases) {
      const aliasKey = normalizeAliasKey(alias);
      if (!aliasKey) continue;
      await prisma.nationalityAlias.upsert({
        where: { aliasKey_nationalityId: { aliasKey, nationalityId: nationality.id } },
        create: { nationalityId: nationality.id, alias, aliasKey },
        update: {},
      });
    }
  }
  console.log(`  nationalities: ${NATIONALITIES.length}`);
}

async function seedSettings(): Promise<void> {
  const settings: Array<{ key: string; value: unknown; description: string }> = [
    { key: 'company.name', value: { en: 'ELBAKRI OVERSEAS', ar: 'البكري اوفرسيز' }, description: 'Company name shown in the interface and exports.' },
    { key: 'operations.timezone', value: { timezone: 'Africa/Cairo' }, description: 'Timezone used for "today" in dashboards and reports.' },
    { key: 'finance.defaultCurrency', value: { currency: 'EGP' }, description: 'Currency assumed when a document does not state one.' },
    { key: 'alerts.visaLeadTimeDays', value: { days: 7 }, description: 'How far ahead a pending visa is flagged before travel.' },
    { key: 'alerts.transferAssignmentDays', value: { days: 3 }, description: 'How far ahead an unassigned transfer is flagged.' },
  ];
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value as never, description: s.description },
      update: { description: s.description },
    });
  }
  console.log(`  settings: ${settings.length}`);
}

/**
 * A small set of clearly fictional records so a fresh install has something to
 * look at. Guarded by SEED_DEMO=true and never enabled in production.
 */
async function seedDemoData(): Promise<void> {
  if (process.env.SEED_DEMO !== 'true') {
    console.log('  demo data: skipped (set SEED_DEMO=true to include it)');
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    console.log('  demo data: refused in production');
    return;
  }

  const partner = await prisma.partner.findFirst({ where: { name: 'SAMA' }, select: { id: true } });
  const hotel = await prisma.hotel.findFirst({ where: { name: 'Jaz Sharm Dreams' }, select: { id: true } });
  const airport = await prisma.location.findFirst({ where: { iataCode: 'SSH' }, select: { id: true } });
  const mealPlan = await prisma.mealPlan.findFirst({ where: { code: 'SAI' }, select: { id: true } });
  const roomType = await prisma.roomType.findFirst({ where: { code: 'DBL' }, select: { id: true } });
  const nationality = await prisma.nationality.findFirst({ where: { code: 'LB' }, select: { id: true } });

  const traveler = await prisma.traveler.create({
    data: {
      fullName: 'Demo Traveller One',
      normalizedName: normalizeForSearch('Demo Traveller One'),
      phoneRaw: '+96170000001',
      phoneNormalized: '+96170000001',
      phoneDigits: '96170000001',
      countryCallingCode: '961',
      nationalityId: nationality?.id ?? null,
      partnerId: partner?.id ?? null,
      notes: 'Fictional record created by the development seed.',
    },
    select: { id: true },
  });

  const year = new Date().getUTCFullYear();
  const sequence = await prisma.referenceSequence.upsert({
    where: { prefix_year: { prefix: 'EB', year } },
    create: { prefix: 'EB', year, current: 1 },
    update: { current: { increment: 1 } },
    select: { current: true },
  });

  const start = new Date(Date.now() + 86400000);
  const end = new Date(Date.now() + 5 * 86400000);

  const trip = await prisma.tripFile.create({
    data: {
      reference: `EB-${year}-${String(sequence.current).padStart(6, '0')}`,
      leadTravelerId: traveler.id,
      partnerId: partner?.id ?? null,
      status: 'CONFIRMED',
      travelStartDate: start,
      travelEndDate: end,
      paxCount: 2,
      notes: 'Fictional demo trip file.',
    },
    select: { id: true },
  });

  await prisma.tripTraveler.create({ data: { tripFileId: trip.id, travelerId: traveler.id, role: 'LEAD' } });

  const booking = await prisma.hotelBooking.create({
    data: {
      reference: `HB-${year}-000001`,
      tripFileId: trip.id,
      leadTravelerId: traveler.id,
      partnerId: partner?.id ?? null,
      hotelId: hotel?.id ?? null,
      bookingDate: new Date(),
      status: 'CONFIRMED',
    },
    select: { id: true },
  });

  const segment = await prisma.hotelStaySegment.create({
    data: {
      hotelBookingId: booking.id,
      hotelId: hotel?.id ?? null,
      checkIn: start,
      checkOut: end,
      nights: Math.round((end.getTime() - start.getTime()) / 86400000),
      mealPlanId: mealPlan?.id ?? null,
      sequence: 1,
    },
    select: { id: true },
  });

  await prisma.roomAllocation.create({
    data: { hotelStaySegmentId: segment.id, roomTypeId: roomType?.id ?? null, quantity: 1, adults: 2 },
  });

  const transfer = await prisma.transferBooking.create({
    data: {
      reference: `TR-${year}-000001`,
      tripFileId: trip.id,
      leadTravelerId: traveler.id,
      partnerId: partner?.id ?? null,
      paxCount: 2,
      status: 'SCHEDULED',
    },
    select: { id: true },
  });

  await prisma.transferLeg.createMany({
    data: [
      {
        transferBookingId: transfer.id, sequence: 1, direction: 'ARRIVAL',
        fromLocationId: airport?.id ?? null, toRaw: 'Jaz Sharm Dreams',
        serviceDate: start, pickupTimeMinutes: 14 * 60 + 30,
        flightNumber: 'DEMO101', paxCount: 2, status: 'SCHEDULED',
      },
      {
        transferBookingId: transfer.id, sequence: 2, direction: 'DEPARTURE',
        fromRaw: 'Jaz Sharm Dreams', toLocationId: airport?.id ?? null,
        serviceDate: end, pickupTimeMinutes: 9 * 60,
        flightNumber: 'DEMO102', paxCount: 2, status: 'SCHEDULED',
      },
    ],
  });

  console.log('  demo data: 1 trip file with a hotel booking and two transfer legs');
}

async function main(): Promise<void> {
  console.log('Seeding ELBAKRI OVERSEAS operations database...');
  await seedPermissionsAndRoles();
  await seedAdmin();
  await seedMasterData();
  await seedSettings();
  await seedDemoData();
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
