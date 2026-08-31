-- AlterTable
ALTER TABLE "User" ADD COLUMN "gmailConnectedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "gmailConnectedEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "gmailRefreshTokenEnc" TEXT;
