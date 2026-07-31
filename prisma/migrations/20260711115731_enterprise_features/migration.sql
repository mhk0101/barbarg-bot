/*
  Warnings:

  - You are about to drop the column `status` on the `LicensePlate` table. All the data in the column will be lost.
  - You are about to drop the column `plateId` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `consigneeAddress` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `consigneeName` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `consigneeNationalId` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `consigneePhone` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `distance` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `insurance` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `loadingDate` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `loadingTime` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `shipperAddress` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `shipperName` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `shipperNationalId` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `shipperPhone` on the `Waybill` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "LicensePlate" DROP COLUMN "status";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "plateId",
ADD COLUMN     "maxRetries" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Waybill" DROP COLUMN "consigneeAddress",
DROP COLUMN "consigneeName",
DROP COLUMN "consigneeNationalId",
DROP COLUMN "consigneePhone",
DROP COLUMN "description",
DROP COLUMN "distance",
DROP COLUMN "insurance",
DROP COLUMN "loadingDate",
DROP COLUMN "loadingTime",
DROP COLUMN "shipperAddress",
DROP COLUMN "shipperName",
DROP COLUMN "shipperNationalId",
DROP COLUMN "shipperPhone",
ADD COLUMN     "cargoCode" TEXT,
ADD COLUMN     "cargoName" TEXT,
ADD COLUMN     "cargoPackaging" TEXT,
ADD COLUMN     "destLat" TEXT,
ADD COLUMN     "destLng" TEXT,
ADD COLUMN     "destPostalCode" TEXT,
ADD COLUMN     "discount" TEXT,
ADD COLUMN     "driverCard" TEXT,
ADD COLUMN     "driverPassword" TEXT,
ADD COLUMN     "insuranceCost" TEXT,
ADD COLUMN     "issueDate" TEXT,
ADD COLUMN     "issueTime" TEXT,
ADD COLUMN     "loadingCost" TEXT,
ADD COLUMN     "originLat" TEXT,
ADD COLUMN     "originLng" TEXT,
ADD COLUMN     "originPostalCode" TEXT,
ADD COLUMN     "persianDate" TEXT,
ADD COLUMN     "receiverAddress" TEXT,
ADD COLUMN     "receiverCompany" TEXT,
ADD COLUMN     "receiverName" TEXT,
ADD COLUMN     "receiverNationalId" TEXT,
ADD COLUMN     "receiverPhone" TEXT,
ADD COLUMN     "senderAddress" TEXT,
ADD COLUMN     "senderCompany" TEXT,
ADD COLUMN     "senderName" TEXT,
ADD COLUMN     "senderNationalId" TEXT,
ADD COLUMN     "senderPhone" TEXT,
ADD COLUMN     "technicalInspection" TEXT,
ADD COLUMN     "vehicleCard" TEXT,
ADD COLUMN     "vehicleInsurance" TEXT,
ADD COLUMN     "waybillNumber" TEXT;

-- AlterTable
ALTER TABLE "WorkerStatus" ADD COLUMN     "currentAccount" TEXT,
ADD COLUMN     "currentDriver" TEXT,
ADD COLUMN     "currentPage" TEXT,
ADD COLUMN     "currentStep" TEXT,
ADD COLUMN     "currentVehicle" TEXT;

-- DropEnum
DROP TYPE "PlateStatus";

-- CreateTable
CREATE TABLE "FuelCard" (
    "id" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "plateId" TEXT,
    "fuelType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "allocatedFuel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumedFuel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelLog" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "station" TEXT,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "accountId" TEXT,
    "errorCode" TEXT NOT NULL,
    "errorTitle" TEXT NOT NULL,
    "errorDescription" TEXT NOT NULL,
    "suggestedSolution" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "retryTime" TEXT,
    "retryStatus" TEXT NOT NULL DEFAULT 'pending',
    "screenshotPath" TEXT,
    "browserLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FuelCard_cardNumber_key" ON "FuelCard"("cardNumber");

-- AddForeignKey
ALTER TABLE "FuelCard" ADD CONSTRAINT "FuelCard_plateId_fkey" FOREIGN KEY ("plateId") REFERENCES "LicensePlate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "FuelCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
