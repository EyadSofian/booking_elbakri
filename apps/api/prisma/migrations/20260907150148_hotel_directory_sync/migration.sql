-- AlterTable
ALTER TABLE "hotels" ADD COLUMN     "childPolicyDefault" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalStatus" TEXT,
ADD COLUMN     "externalUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "facilities" TEXT,
ADD COLUMN     "hotelGroupName" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "region" TEXT,
ADD COLUMN     "sourceSystem" TEXT,
ADD COLUMN     "subRegion" TEXT,
ADD COLUMN     "syncStatus" TEXT NOT NULL DEFAULT 'LOCAL_ONLY',
ADD COLUMN     "transferNotesDefault" TEXT;

-- CreateIndex
CREATE INDEX "hotels_syncStatus_idx" ON "hotels"("syncStatus");

-- CreateIndex
CREATE INDEX "hotels_region_idx" ON "hotels"("region");

-- CreateIndex
CREATE UNIQUE INDEX "hotels_sourceSystem_externalId_key" ON "hotels"("sourceSystem", "externalId");

-- CreateIndex
CREATE INDEX "locations_hotelId_idx" ON "locations"("hotelId");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

