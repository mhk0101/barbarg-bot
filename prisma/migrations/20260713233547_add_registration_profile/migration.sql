-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "profileId" TEXT;

-- CreateTable
CREATE TABLE "RegistrationProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "plateNumber" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverNationalId" TEXT NOT NULL,
    "driverMobile" TEXT,
    "driverLicense" TEXT,
    "driverCard" TEXT,
    "vehicleType" TEXT,
    "cargoCapacity" TEXT,
    "passengerCapacity" TEXT,
    "loaderType" TEXT,
    "thirdPartyInsurance" TEXT,
    "activityLicense" TEXT,
    "senderFirstName" TEXT NOT NULL,
    "senderLastName" TEXT NOT NULL,
    "senderMobile" TEXT NOT NULL,
    "senderPhone" TEXT,
    "senderNationalId" TEXT NOT NULL,
    "senderPostalCode" TEXT,
    "receiverFirstName" TEXT NOT NULL,
    "receiverLastName" TEXT NOT NULL,
    "receiverMobile" TEXT NOT NULL,
    "receiverPhone" TEXT,
    "receiverNationalId" TEXT NOT NULL,
    "receiverPostalCode" TEXT,
    "cargoName" TEXT NOT NULL,
    "cargoCategory" TEXT,
    "cargoPackaging" TEXT,
    "cargoWeight" TEXT,
    "cargoQuantity" TEXT,
    "cargoValue" TEXT,
    "originProvince" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "originAddress" TEXT,
    "originPostalCode" TEXT,
    "destProvince" TEXT NOT NULL,
    "destCity" TEXT NOT NULL,
    "destAddress" TEXT,
    "destPostalCode" TEXT,
    "freightCost" TEXT,
    "paymentMethod" TEXT,
    "registrationsPerDay" INTEGER NOT NULL DEFAULT 10,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "retryIntervalSec" INTEGER NOT NULL DEFAULT 30,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "accountId" TEXT,
    "lastRun" TIMESTAMP(3),
    "nextRun" TIMESTAMP(3),
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "successfulRuns" INTEGER NOT NULL DEFAULT 0,
    "failedRuns" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistrationProfile_status_nextRun_idx" ON "RegistrationProfile"("status", "nextRun");

-- CreateIndex
CREATE INDEX "RegistrationProfile_accountId_idx" ON "RegistrationProfile"("accountId");

-- CreateIndex
CREATE INDEX "RegistrationProfile_plateNumber_idx" ON "RegistrationProfile"("plateNumber");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RegistrationProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationProfile" ADD CONSTRAINT "RegistrationProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BarBargAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
