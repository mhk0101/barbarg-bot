-- CreateIndex
CREATE INDEX "Account_companyId_idx" ON "Account"("companyId");

-- CreateIndex
CREATE INDEX "Account_status_idx" ON "Account"("status");

-- CreateIndex
CREATE INDEX "ActivityLog_resource_idx" ON "ActivityLog"("resource");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "AutomationResult_status_finishedAt_idx" ON "AutomationResult"("status", "finishedAt");

-- CreateIndex
CREATE INDEX "AutomationResult_workerId_idx" ON "AutomationResult"("workerId");

-- CreateIndex
CREATE INDEX "AutomationResult_accountId_idx" ON "AutomationResult"("accountId");

-- CreateIndex
CREATE INDEX "BarbargHistory_templateId_idx" ON "BarbargHistory"("templateId");

-- CreateIndex
CREATE INDEX "BarbargHistory_plateNumber_idx" ON "BarbargHistory"("plateNumber");

-- CreateIndex
CREATE INDEX "BarbargHistory_createdAt_idx" ON "BarbargHistory"("createdAt");

-- CreateIndex
CREATE INDEX "BarbargTemplate_plateId_idx" ON "BarbargTemplate"("plateId");

-- CreateIndex
CREATE INDEX "BarbargTemplate_plateNumber_idx" ON "BarbargTemplate"("plateNumber");

-- CreateIndex
CREATE INDEX "ErrorLog_jobId_idx" ON "ErrorLog"("jobId");

-- CreateIndex
CREATE INDEX "ErrorLog_accountId_idx" ON "ErrorLog"("accountId");

-- CreateIndex
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "ErrorLog_retryStatus_idx" ON "ErrorLog"("retryStatus");

-- CreateIndex
CREATE INDEX "FuelLog_cardId_idx" ON "FuelLog"("cardId");

-- CreateIndex
CREATE INDEX "Job_status_createdAt_idx" ON "Job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_waybillId_idx" ON "Job"("waybillId");

-- CreateIndex
CREATE INDEX "JobLog_jobId_idx" ON "JobLog"("jobId");

-- CreateIndex
CREATE INDEX "LicensePlate_accountId_idx" ON "LicensePlate"("accountId");

-- CreateIndex
CREATE INDEX "LicensePlate_status_idx" ON "LicensePlate"("status");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Vehicle_driverId_idx" ON "Vehicle"("driverId");

-- CreateIndex
CREATE INDEX "Vehicle_status_idx" ON "Vehicle"("status");
