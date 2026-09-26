-- AlterTable
ALTER TABLE "FrontDeskAlert" ADD COLUMN     "agentNote" TEXT;

-- AlterTable
ALTER TABLE "HousekeepingRequest" ADD COLUMN     "agentNote" TEXT,
ADD COLUMN     "priority" TEXT;

-- AlterTable
ALTER TABLE "KitchenTicket" ADD COLUMN     "agentNote" TEXT,
ADD COLUMN     "priority" TEXT;

-- AlterTable
ALTER TABLE "LibraryRequest" ADD COLUMN     "agentNote" TEXT,
ADD COLUMN     "priority" TEXT;

-- AlterTable
ALTER TABLE "SpaBooking" ADD COLUMN     "agentNote" TEXT,
ADD COLUMN     "priority" TEXT;
