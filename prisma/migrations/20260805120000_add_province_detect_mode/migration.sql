-- AlterTable
ALTER TABLE "RegistrationProfile" ADD COLUMN IF NOT EXISTS "originProvinceMode" TEXT NOT NULL DEFAULT 'auto_plate';
ALTER TABLE "RegistrationProfile" ADD COLUMN IF NOT EXISTS "destProvinceMode" TEXT NOT NULL DEFAULT 'auto_plate';
