/*
  Warnings:

  - Changed the type of `type` on the `Task` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_plateId_fkey";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "dailyUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "type",
ADD COLUMN     "type" TEXT NOT NULL;

-- DropEnum
DROP TYPE "TaskType";

-- CreateTable
CREATE TABLE "Waybill" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "plateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "driverName" TEXT,
    "driverNationalId" TEXT,
    "driverPhone" TEXT,
    "driverLicense" TEXT,
    "shipperName" TEXT,
    "shipperNationalId" TEXT,
    "shipperPhone" TEXT,
    "shipperAddress" TEXT,
    "consigneeName" TEXT,
    "consigneeNationalId" TEXT,
    "consigneePhone" TEXT,
    "consigneeAddress" TEXT,
    "cargoType" TEXT,
    "cargoDescription" TEXT,
    "cargoWeight" TEXT,
    "cargoQuantity" TEXT,
    "cargoValue" TEXT,
    "loadingDate" TEXT,
    "loadingTime" TEXT,
    "originProvince" TEXT,
    "originCity" TEXT,
    "originAddress" TEXT,
    "destProvince" TEXT,
    "destCity" TEXT,
    "destAddress" TEXT,
    "distance" TEXT,
    "vehicleType" TEXT,
    "trailerInfo" TEXT,
    "freightCost" TEXT,
    "paymentMethod" TEXT,
    "insurance" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Waybill_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Waybill" ADD CONSTRAINT "Waybill_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waybill" ADD CONSTRAINT "Waybill_plateId_fkey" FOREIGN KEY ("plateId") REFERENCES "LicensePlate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
