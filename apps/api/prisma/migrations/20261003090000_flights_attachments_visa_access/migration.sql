
-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('PASSPORT', 'TICKET');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "visaAccess" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "visas" ADD COLUMN     "flightNo" TEXT;

-- CreateTable
CREATE TABLE "flights" (
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
    "returnDate" DATE,
    "airline" TEXT,
    "flightNo" TEXT,
    "ticketNo" TEXT,
    "passportNo" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "cost" DECIMAL(12,2),
    "sell" DECIMAL(12,2),
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "flights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "flights_number_key" ON "flights"("number");

-- CreateIndex
CREATE INDEX "flights_travelDate_idx" ON "flights"("travelDate");

-- CreateIndex
CREATE INDEX "flights_status_idx" ON "flights"("status");

-- CreateIndex
CREATE INDEX "flights_agencyId_idx" ON "flights"("agencyId");

-- CreateIndex
CREATE INDEX "flights_deletedAt_idx" ON "flights"("deletedAt");

-- CreateIndex
CREATE INDEX "attachments_entityType_entityId_idx" ON "attachments"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

