-- AlterTable
ALTER TABLE "BarBargAccount" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "smsWebhookToken" TEXT;

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "fromNumber" TEXT,
    "rawText" TEXT NOT NULL,
    "extractedLink" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "usedAt" TIMESTAMP(3),
    "resultMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BarBargAccount_smsWebhookToken_key" ON "BarBargAccount"("smsWebhookToken");

-- CreateIndex
CREATE INDEX "SmsMessage_accountId_idx" ON "SmsMessage"("accountId");

-- CreateIndex
CREATE INDEX "SmsMessage_status_idx" ON "SmsMessage"("status");

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BarBargAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
