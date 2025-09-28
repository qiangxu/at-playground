-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "flags" SET DEFAULT '{}'::jsonb;

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "qtyFilled" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tif" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reserveRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "buyOrderId" TEXT NOT NULL,
    "sellOrderId" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "notional" DECIMAL(65,30) NOT NULL,
    "settlement" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Balance" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "available" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("id")
);
