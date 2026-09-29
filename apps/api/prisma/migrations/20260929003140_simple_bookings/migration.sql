-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SALES', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('NEW', 'IN_PROGRESS', 'CONFIRMED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('EGP', 'USD', 'EUR', 'SAR');

-- CreateEnum
CREATE TYPE "TransferKind" AS ENUM ('ARRIVAL', 'DEPARTURE', 'TRANSFER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATIONS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isDirect" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotels" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'NEW',
    "saleDate" DATE NOT NULL,
    "customerName" TEXT NOT NULL,
    "nationality" TEXT,
    "phone" TEXT,
    "destination" TEXT,
    "hotelName" TEXT,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "singleRooms" INTEGER NOT NULL DEFAULT 0,
    "doubleRooms" INTEGER NOT NULL DEFAULT 0,
    "tripleRooms" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATE,
    "endDate" DATE,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "hotelCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hotelSell" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "flightDetails" TEXT,
    "flightCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "flightSell" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "flightCommission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transferDetails" TEXT,
    "transferCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transferSell" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "serviceType" TEXT,
    "serviceCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "serviceSell" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sellerId" UUID,
    "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "notes" TEXT,
    "sourceKey" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidOn" DATE NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_bookings" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'NEW',
    "guestName" TEXT NOT NULL,
    "nationality" TEXT,
    "phone" TEXT,
    "agencyId" UUID,
    "hotelId" UUID,
    "checkIn" DATE,
    "checkOut" DATE,
    "rooms" TEXT,
    "mealPlan" TEXT,
    "adults" INTEGER,
    "children" INTEGER,
    "bookingDate" DATE,
    "confirmationNo" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "cost" DECIMAL(12,2),
    "sell" DECIMAL(12,2),
    "paidToHotel" DECIMAL(12,2),
    "hotelPaidOn" DATE,
    "notes" TEXT,
    "saleId" UUID,
    "sourceKey" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "hotel_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'NEW',
    "kind" "TransferKind" NOT NULL DEFAULT 'TRANSFER',
    "guestName" TEXT NOT NULL,
    "nationality" TEXT,
    "phone" TEXT,
    "agencyId" UUID,
    "date" DATE,
    "time" TEXT,
    "fromPlace" TEXT,
    "toPlace" TEXT,
    "flightNo" TEXT,
    "adults" INTEGER,
    "children" INTEGER,
    "vehicle" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "cost" DECIMAL(12,2),
    "sell" DECIMAL(12,2),
    "notes" TEXT,
    "saleId" UUID,
    "sourceKey" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excursions" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'NEW',
    "guestName" TEXT NOT NULL,
    "nationality" TEXT,
    "phone" TEXT,
    "agencyId" UUID,
    "activity" TEXT NOT NULL,
    "hotelName" TEXT,
    "date" DATE,
    "time" TEXT,
    "adults" INTEGER,
    "children" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "cost" DECIMAL(12,2),
    "sell" DECIMAL(12,2),
    "notes" TEXT,
    "saleId" UUID,
    "sourceKey" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "excursions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visas" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'NEW',
    "guestName" TEXT NOT NULL,
    "nationality" TEXT,
    "phone" TEXT,
    "agencyId" UUID,
    "pax" INTEGER NOT NULL DEFAULT 1,
    "fromPlace" TEXT,
    "toPlace" TEXT,
    "travelDate" DATE,
    "passportNo" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "cost" DECIMAL(12,2),
    "sell" DECIMAL(12,2),
    "notes" TEXT,
    "saleId" UUID,
    "sourceKey" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "visas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT,
    "changes" JSONB,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_name_key" ON "agencies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "hotels_name_key" ON "hotels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sales_number_key" ON "sales"("number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_sourceKey_key" ON "sales"("sourceKey");

-- CreateIndex
CREATE INDEX "sales_status_idx" ON "sales"("status");

-- CreateIndex
CREATE INDEX "sales_saleDate_idx" ON "sales"("saleDate");

-- CreateIndex
CREATE INDEX "sales_startDate_idx" ON "sales"("startDate");

-- CreateIndex
CREATE INDEX "sales_sellerId_idx" ON "sales"("sellerId");

-- CreateIndex
CREATE INDEX "sales_deletedAt_idx" ON "sales"("deletedAt");

-- CreateIndex
CREATE INDEX "sale_payments_saleId_idx" ON "sale_payments"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_bookings_number_key" ON "hotel_bookings"("number");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_bookings_sourceKey_key" ON "hotel_bookings"("sourceKey");

-- CreateIndex
CREATE INDEX "hotel_bookings_checkIn_idx" ON "hotel_bookings"("checkIn");

-- CreateIndex
CREATE INDEX "hotel_bookings_checkOut_idx" ON "hotel_bookings"("checkOut");

-- CreateIndex
CREATE INDEX "hotel_bookings_status_idx" ON "hotel_bookings"("status");

-- CreateIndex
CREATE INDEX "hotel_bookings_agencyId_idx" ON "hotel_bookings"("agencyId");

-- CreateIndex
CREATE INDEX "hotel_bookings_hotelId_idx" ON "hotel_bookings"("hotelId");

-- CreateIndex
CREATE INDEX "hotel_bookings_saleId_idx" ON "hotel_bookings"("saleId");

-- CreateIndex
CREATE INDEX "hotel_bookings_deletedAt_idx" ON "hotel_bookings"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_number_key" ON "transfers"("number");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_sourceKey_key" ON "transfers"("sourceKey");

-- CreateIndex
CREATE INDEX "transfers_date_idx" ON "transfers"("date");

-- CreateIndex
CREATE INDEX "transfers_status_idx" ON "transfers"("status");

-- CreateIndex
CREATE INDEX "transfers_agencyId_idx" ON "transfers"("agencyId");

-- CreateIndex
CREATE INDEX "transfers_saleId_idx" ON "transfers"("saleId");

-- CreateIndex
CREATE INDEX "transfers_deletedAt_idx" ON "transfers"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "excursions_number_key" ON "excursions"("number");

-- CreateIndex
CREATE UNIQUE INDEX "excursions_sourceKey_key" ON "excursions"("sourceKey");

-- CreateIndex
CREATE INDEX "excursions_date_idx" ON "excursions"("date");

-- CreateIndex
CREATE INDEX "excursions_status_idx" ON "excursions"("status");

-- CreateIndex
CREATE INDEX "excursions_agencyId_idx" ON "excursions"("agencyId");

-- CreateIndex
CREATE INDEX "excursions_saleId_idx" ON "excursions"("saleId");

-- CreateIndex
CREATE INDEX "excursions_deletedAt_idx" ON "excursions"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "visas_number_key" ON "visas"("number");

-- CreateIndex
CREATE UNIQUE INDEX "visas_sourceKey_key" ON "visas"("sourceKey");

-- CreateIndex
CREATE INDEX "visas_travelDate_idx" ON "visas"("travelDate");

-- CreateIndex
CREATE INDEX "visas_status_idx" ON "visas"("status");

-- CreateIndex
CREATE INDEX "visas_agencyId_idx" ON "visas"("agencyId");

-- CreateIndex
CREATE INDEX "visas_saleId_idx" ON "visas"("saleId");

-- CreateIndex
CREATE INDEX "visas_deletedAt_idx" ON "visas"("deletedAt");

-- CreateIndex
CREATE INDEX "activities_entityType_entityId_idx" ON "activities"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "activities_createdAt_idx" ON "activities"("createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursions" ADD CONSTRAINT "excursions_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursions" ADD CONSTRAINT "excursions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursions" ADD CONSTRAINT "excursions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visas" ADD CONSTRAINT "visas_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visas" ADD CONSTRAINT "visas_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visas" ADD CONSTRAINT "visas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
