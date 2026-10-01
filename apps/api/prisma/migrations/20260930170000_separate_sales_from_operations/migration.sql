-- Sales and operations are kept entirely apart: an operations booking is no
-- longer linked to a sale.
--
-- Bookings that were created from a sale are sales records, not operations
-- work, so they leave the operations lists first (soft-deleted — the rows
-- stay in the table, and the sale itself keeps everything it had).
UPDATE "hotel_bookings" SET "deletedAt" = now() WHERE "saleId" IS NOT NULL AND "deletedAt" IS NULL;
UPDATE "transfers"      SET "deletedAt" = now() WHERE "saleId" IS NOT NULL AND "deletedAt" IS NULL;
UPDATE "excursions"     SET "deletedAt" = now() WHERE "saleId" IS NOT NULL AND "deletedAt" IS NULL;
UPDATE "visas"          SET "deletedAt" = now() WHERE "saleId" IS NOT NULL AND "deletedAt" IS NULL;

-- DropForeignKey
ALTER TABLE "excursions" DROP CONSTRAINT "excursions_saleId_fkey";

-- DropForeignKey
ALTER TABLE "hotel_bookings" DROP CONSTRAINT "hotel_bookings_saleId_fkey";

-- DropForeignKey
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_saleId_fkey";

-- DropForeignKey
ALTER TABLE "visas" DROP CONSTRAINT "visas_saleId_fkey";

-- DropIndex
DROP INDEX "excursions_saleId_idx";

-- DropIndex
DROP INDEX "hotel_bookings_saleId_idx";

-- DropIndex
DROP INDEX "transfers_saleId_idx";

-- DropIndex
DROP INDEX "visas_saleId_idx";

-- AlterTable
ALTER TABLE "excursions" DROP COLUMN "saleId";

-- AlterTable
ALTER TABLE "hotel_bookings" DROP COLUMN "saleId";

-- AlterTable
ALTER TABLE "transfers" DROP COLUMN "saleId";

-- AlterTable
ALTER TABLE "visas" DROP COLUMN "saleId";
