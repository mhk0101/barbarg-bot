-- CreateTable
CREATE TABLE "BarbargTemplate" (
    "id" TEXT NOT NULL,
    "plateId" TEXT,
    "plateNumber" TEXT NOT NULL,
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
    "driverName" TEXT NOT NULL,
    "driverMobile" TEXT NOT NULL,
    "driverLicense" TEXT NOT NULL,
    "driverLicenseGrade" TEXT,
    "driverCard" TEXT,
    "cargoCapacity" TEXT,
    "passengerCapacity" TEXT,
    "loaderType" TEXT,
    "thirdPartyInsurance" TEXT,
    "activityLicense" TEXT,
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
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BarbargTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarbargHistory" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "plateNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'success',
    "waybillNumber" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarbargHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickRegistrationJob" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickRegistrationJob_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BarbargTemplate" ADD CONSTRAINT "BarbargTemplate_plateId_fkey" FOREIGN KEY ("plateId") REFERENCES "LicensePlate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarbargHistory" ADD CONSTRAINT "BarbargHistory_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BarbargTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickRegistrationJob" ADD CONSTRAINT "QuickRegistrationJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BarbargTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
