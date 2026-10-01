-- A sale can now hold any number of hotels, flights, transfers and services.
-- The single hotel / flight / transfer / service columns move into sale_lines,
-- one line per item a sale already had, then the old columns are dropped.

-- CreateEnum
CREATE TYPE "SaleLineKind" AS ENUM ('HOTEL', 'FLIGHT', 'TRANSFER', 'SERVICE');

-- CreateTable
CREATE TABLE "sale_lines" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "kind" "SaleLineKind" NOT NULL,
    "title" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "singleRooms" INTEGER NOT NULL DEFAULT 0,
    "doubleRooms" INTEGER NOT NULL DEFAULT 0,
    "tripleRooms" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sell" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_lines_saleId_idx" ON "sale_lines"("saleId");

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move what each sale already has into lines.
INSERT INTO "sale_lines" ("id", "saleId", "position", "kind", "title", "startDate", "endDate", "singleRooms", "doubleRooms", "tripleRooms", "cost", "sell")
SELECT gen_random_uuid(), "id", 0, 'HOTEL', "hotelName", "startDate", "endDate", "singleRooms", "doubleRooms", "tripleRooms", "hotelCost", "hotelSell"
FROM "sales"
WHERE "hotelName" IS NOT NULL OR "hotelCost" <> 0 OR "hotelSell" <> 0;

INSERT INTO "sale_lines" ("id", "saleId", "position", "kind", "title", "startDate", "cost", "sell", "commission")
SELECT gen_random_uuid(), "id", 1, 'FLIGHT', "flightDetails", "startDate", "flightCost", "flightSell", "flightCommission"
FROM "sales"
WHERE "flightDetails" IS NOT NULL OR "flightCost" <> 0 OR "flightSell" <> 0 OR "flightCommission" <> 0;

INSERT INTO "sale_lines" ("id", "saleId", "position", "kind", "title", "startDate", "cost", "sell")
SELECT gen_random_uuid(), "id", 2, 'TRANSFER', "transferDetails", "startDate", "transferCost", "transferSell"
FROM "sales"
WHERE "transferDetails" IS NOT NULL OR "transferCost" <> 0 OR "transferSell" <> 0;

INSERT INTO "sale_lines" ("id", "saleId", "position", "kind", "title", "startDate", "cost", "sell")
SELECT gen_random_uuid(), "id", 3, 'SERVICE', "serviceType", "startDate", "serviceCost", "serviceSell"
FROM "sales"
WHERE "serviceType" IS NOT NULL OR "serviceCost" <> 0 OR "serviceSell" <> 0;

-- AlterTable
ALTER TABLE "sales" DROP COLUMN "doubleRooms",
DROP COLUMN "flightCommission",
DROP COLUMN "flightCost",
DROP COLUMN "flightDetails",
DROP COLUMN "flightSell",
DROP COLUMN "hotelCost",
DROP COLUMN "hotelName",
DROP COLUMN "hotelSell",
DROP COLUMN "serviceCost",
DROP COLUMN "serviceSell",
DROP COLUMN "serviceType",
DROP COLUMN "singleRooms",
DROP COLUMN "transferCost",
DROP COLUMN "transferDetails",
DROP COLUMN "transferSell",
DROP COLUMN "tripleRooms";
