-- Add nullable first (existing Hotel rows have neither column yet) so this doesn't fail
-- against real data, then backfill the pre-existing hotel before enforcing NOT NULL + UNIQUE.
ALTER TABLE "Hotel" ADD COLUMN     "adminApiKey" TEXT,
ADD COLUMN     "slug" TEXT;

-- Preserves the pre-existing single hotel's current admin key/slug so nothing already
-- deployed (the admin panel, any saved bookmarks/QR codes) breaks after this migration.
UPDATE "Hotel" SET "slug" = 'baikal-sphere', "adminApiKey" = 'admin123' WHERE "id" = 'hotel_1';

ALTER TABLE "Hotel" ALTER COLUMN "adminApiKey" SET NOT NULL,
ALTER COLUMN "slug" SET NOT NULL;

-- CreateTable
CREATE TABLE "ConciergeRequest" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "roomNumber" TEXT,
    "guestName" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentNote" TEXT,

    CONSTRAINT "ConciergeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConciergeRequest_hotelId_idx" ON "ConciergeRequest"("hotelId");

-- CreateIndex
CREATE INDEX "ConciergeRequest_sessionId_idx" ON "ConciergeRequest"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_slug_key" ON "Hotel"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_adminApiKey_key" ON "Hotel"("adminApiKey");

-- AddForeignKey
ALTER TABLE "ConciergeRequest" ADD CONSTRAINT "ConciergeRequest_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciergeRequest" ADD CONSTRAINT "ConciergeRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
