-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ServiceRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticketNumber" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "queryTypeId" INTEGER NOT NULL,
    "plantId" INTEGER NOT NULL,
    "requesterId" INTEGER NOT NULL,
    "assignedToId" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "gmailThreadId" TEXT,
    "lastEmailMessageId" TEXT,
    "keywordMatched" BOOLEAN NOT NULL DEFAULT true,
    "originalToRaw" TEXT,
    "originalCcRaw" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    CONSTRAINT "ServiceRequest_queryTypeId_fkey" FOREIGN KEY ("queryTypeId") REFERENCES "QueryType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceRequest_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ServiceRequest" ("assignedToId", "body", "createdAt", "gmailThreadId", "id", "lastEmailMessageId", "plantId", "queryTypeId", "requesterId", "resolvedAt", "source", "status", "subject", "ticketNumber", "updatedAt") SELECT "assignedToId", "body", "createdAt", "gmailThreadId", "id", "lastEmailMessageId", "plantId", "queryTypeId", "requesterId", "resolvedAt", "source", "status", "subject", "ticketNumber", "updatedAt" FROM "ServiceRequest";
DROP TABLE "ServiceRequest";
ALTER TABLE "new_ServiceRequest" RENAME TO "ServiceRequest";
CREATE UNIQUE INDEX "ServiceRequest_ticketNumber_key" ON "ServiceRequest"("ticketNumber");
CREATE UNIQUE INDEX "ServiceRequest_gmailThreadId_key" ON "ServiceRequest"("gmailThreadId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
