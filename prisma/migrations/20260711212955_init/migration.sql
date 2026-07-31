/*
  Warnings:

  - The `status` column on the `Account` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `retryTime` on the `ErrorLog` table. All the data in the column will be lost.
  - You are about to drop the column `taskId` on the `ErrorLog` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `LicensePlate` table. All the data in the column will be lost.
  - You are about to drop the column `owner` on the `LicensePlate` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleType` on the `LicensePlate` table. All the data in the column will be lost.
  - The `role` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `accountId` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `cargoCode` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `cargoDescription` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `cargoName` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `cargoPackaging` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `cargoType` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `driverCard` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `driverLicense` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `driverName` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `driverNationalId` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `driverPassword` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `driverPhone` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `receiverAddress` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `receiverCompany` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `receiverName` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `receiverNationalId` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `receiverPhone` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `senderAddress` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `senderCompany` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `senderName` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `senderNationalId` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `senderPhone` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `technicalInspection` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `trailerInfo` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleCard` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleInsurance` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleType` on the `Waybill` table. All the data in the column will be lost.
  - You are about to drop the `BotSettings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Task` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TaskLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WorkerStatus` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ErrorLog" DROP CONSTRAINT "ErrorLog_taskId_fkey";

-- DropForeignKey
ALTER TABLE "LicensePlate" DROP CONSTRAINT "LicensePlate_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_accountId_fkey";

-- DropForeignKey
ALTER TABLE "TaskLog" DROP CONSTRAINT "TaskLog_taskId_fkey";

-- DropForeignKey
ALTER TABLE "Waybill" DROP CONSTRAINT "Waybill_accountId_fkey";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "companyId" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "ErrorLog" DROP COLUMN "retryTime",
DROP COLUMN "taskId",
ADD COLUMN     "jobId" TEXT;

-- AlterTable
ALTER TABLE "LicensePlate" DROP COLUMN "notes",
DROP COLUMN "owner",
DROP COLUMN "vehicleType",
ADD COLUMN     "dailyCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dailyTarget" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "vehicleId" TEXT,
ADD COLUMN     "workingEnd" TEXT NOT NULL DEFAULT '17:00',
ADD COLUMN     "workingStart" TEXT NOT NULL DEFAULT '08:00',
ALTER COLUMN "accountId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user';

-- AlterTable
ALTER TABLE "Waybill" DROP COLUMN "accountId",
DROP COLUMN "cargoCode",
DROP COLUMN "cargoDescription",
DROP COLUMN "cargoName",
DROP COLUMN "cargoPackaging",
DROP COLUMN "cargoType",
DROP COLUMN "driverCard",
DROP COLUMN "driverLicense",
DROP COLUMN "driverName",
DROP COLUMN "driverNationalId",
DROP COLUMN "driverPassword",
DROP COLUMN "driverPhone",
DROP COLUMN "receiverAddress",
DROP COLUMN "receiverCompany",
DROP COLUMN "receiverName",
DROP COLUMN "receiverNationalId",
DROP COLUMN "receiverPhone",
DROP COLUMN "senderAddress",
DROP COLUMN "senderCompany",
DROP COLUMN "senderName",
DROP COLUMN "senderNationalId",
DROP COLUMN "senderPhone",
DROP COLUMN "technicalInspection",
DROP COLUMN "trailerInfo",
DROP COLUMN "vehicleCard",
DROP COLUMN "vehicleInsurance",
DROP COLUMN "vehicleType",
ADD COLUMN     "cargoId" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "distance" TEXT,
ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "receiverId" TEXT,
ADD COLUMN     "senderId" TEXT,
ADD COLUMN     "vehicleId" TEXT;

-- DropTable
DROP TABLE "BotSettings";

-- DropTable
DROP TABLE "Task";

-- DropTable
DROP TABLE "TaskLog";

-- DropTable
DROP TABLE "WorkerStatus";

-- DropEnum
DROP TYPE "AccountStatus";

-- DropEnum
DROP TYPE "TaskStatus";

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "driverCard" TEXT,
    "password" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "dailyTarget" INTEGER NOT NULL DEFAULT 10,
    "workingStart" TEXT NOT NULL DEFAULT '08:00',
    "workingEnd" TEXT NOT NULL DEFAULT '17:00',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "driverId" TEXT,
    "vehicleType" TEXT NOT NULL,
    "trailerInfo" TEXT,
    "vehicleCard" TEXT,
    "technicalInspection" TEXT,
    "vehicleInsurance" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sender" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "postalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receiver" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "postalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cargo" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT NOT NULL,
    "packaging" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaybillTimeline" (
    "id" TEXT NOT NULL,
    "waybillId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaybillTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "waybillId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "nextRetryAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "result" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scheduler" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cronExpr" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRun" TIMESTAMP(3),
    "nextRun" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scheduler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_nationalId_key" ON "Company"("nationalId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_nationalId_key" ON "Driver"("nationalId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicensePlate" ADD CONSTRAINT "LicensePlate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicensePlate" ADD CONSTRAINT "LicensePlate_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicensePlate" ADD CONSTRAINT "LicensePlate_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sender" ADD CONSTRAINT "Sender_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receiver" ADD CONSTRAINT "Receiver_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waybill" ADD CONSTRAINT "Waybill_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waybill" ADD CONSTRAINT "Waybill_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Receiver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waybill" ADD CONSTRAINT "Waybill_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waybill" ADD CONSTRAINT "Waybill_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waybill" ADD CONSTRAINT "Waybill_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaybillTimeline" ADD CONSTRAINT "WaybillTimeline_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "Waybill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "Waybill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLog" ADD CONSTRAINT "JobLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
