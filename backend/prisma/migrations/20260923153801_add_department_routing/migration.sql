-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "department" TEXT NOT NULL DEFAULT 'kitchen',
ADD COLUMN     "housekeepingItemId" TEXT,
ADD COLUMN     "libraryItemId" TEXT;

-- CreateTable
CREATE TABLE "HousekeepingItem" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HousekeepingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryItem" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "author" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenTicket" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "roomNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitchenTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "roomNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HousekeepingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaBooking" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "roomNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "roomNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HousekeepingItem_hotelId_idx" ON "HousekeepingItem"("hotelId");

-- CreateIndex
CREATE INDEX "LibraryItem_hotelId_idx" ON "LibraryItem"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenTicket_orderItemId_key" ON "KitchenTicket"("orderItemId");

-- CreateIndex
CREATE INDEX "KitchenTicket_orderId_idx" ON "KitchenTicket"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "HousekeepingRequest_orderItemId_key" ON "HousekeepingRequest"("orderItemId");

-- CreateIndex
CREATE INDEX "HousekeepingRequest_orderId_idx" ON "HousekeepingRequest"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SpaBooking_orderItemId_key" ON "SpaBooking"("orderItemId");

-- CreateIndex
CREATE INDEX "SpaBooking_orderId_idx" ON "SpaBooking"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryRequest_orderItemId_key" ON "LibraryRequest"("orderItemId");

-- CreateIndex
CREATE INDEX "LibraryRequest_orderId_idx" ON "LibraryRequest"("orderId");

-- AddForeignKey
ALTER TABLE "HousekeepingItem" ADD CONSTRAINT "HousekeepingItem_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_housekeepingItemId_fkey" FOREIGN KEY ("housekeepingItemId") REFERENCES "HousekeepingItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_libraryItemId_fkey" FOREIGN KEY ("libraryItemId") REFERENCES "LibraryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
