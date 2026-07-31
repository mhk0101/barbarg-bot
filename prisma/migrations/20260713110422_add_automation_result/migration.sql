-- CreateTable
CREATE TABLE "AutomationResult" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "waybillNumber" TEXT,
    "plate" TEXT,
    "driver" TEXT,
    "vehicle" TEXT,
    "sender" TEXT,
    "receiver" TEXT,
    "accountId" TEXT,
    "workerId" TEXT,
    "browserSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resultMessage" TEXT,
    "resultType" TEXT NOT NULL DEFAULT 'info',
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "screenshotPath" TEXT,
    "htmlSnapshotPath" TEXT,
    "currentUrl" TEXT,
    "playwrightLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationResult_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AutomationResult" ADD CONSTRAINT "AutomationResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationResult" ADD CONSTRAINT "AutomationResult_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationResult" ADD CONSTRAINT "AutomationResult_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
