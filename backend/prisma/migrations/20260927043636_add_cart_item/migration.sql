-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "spaServiceId" TEXT,
    "housekeepingItemId" TEXT,
    "libraryItemId" TEXT,
    "department" TEXT NOT NULL DEFAULT 'kitchen',
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CartItem_sessionId_idx" ON "CartItem"("sessionId");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_spaServiceId_fkey" FOREIGN KEY ("spaServiceId") REFERENCES "SpaService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_housekeepingItemId_fkey" FOREIGN KEY ("housekeepingItemId") REFERENCES "HousekeepingItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_libraryItemId_fkey" FOREIGN KEY ("libraryItemId") REFERENCES "LibraryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
