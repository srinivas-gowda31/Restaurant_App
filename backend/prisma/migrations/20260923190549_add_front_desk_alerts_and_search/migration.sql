-- CreateTable
CREATE TABLE "FrontDeskAlert" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "roomNumber" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrontDeskAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FrontDeskAlert_hotelId_idx" ON "FrontDeskAlert"("hotelId");

-- CreateIndex
CREATE INDEX "FrontDeskAlert_sessionId_idx" ON "FrontDeskAlert"("sessionId");

-- AddForeignKey
ALTER TABLE "FrontDeskAlert" ADD CONSTRAINT "FrontDeskAlert_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrontDeskAlert" ADD CONSTRAINT "FrontDeskAlert_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
