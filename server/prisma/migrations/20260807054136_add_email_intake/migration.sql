-- CreateTable
CREATE TABLE "ProcessedEmail" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gmailMessageId" TEXT NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EmailSyncStatus" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "lastPollAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "lastError" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Comment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "srId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "gmailMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_srId_fkey" FOREIGN KEY ("srId") REFERENCES "ServiceRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Comment" ("authorId", "body", "createdAt", "id", "srId") SELECT "authorId", "body", "createdAt", "id", "srId" FROM "Comment";
DROP TABLE "Comment";
ALTER TABLE "new_Comment" RENAME TO "Comment";
CREATE UNIQUE INDEX "Comment_gmailMessageId_key" ON "Comment"("gmailMessageId");
CREATE TABLE "new_QueryType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "keywords" TEXT,
    "isEmailDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_QueryType" ("active", "createdAt", "description", "id", "name") SELECT "active", "createdAt", "description", "id", "name" FROM "QueryType";
DROP TABLE "QueryType";
ALTER TABLE "new_QueryType" RENAME TO "QueryType";
CREATE UNIQUE INDEX "QueryType_name_key" ON "QueryType"("name");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    CONSTRAINT "ServiceRequest_queryTypeId_fkey" FOREIGN KEY ("queryTypeId") REFERENCES "QueryType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceRequest_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ServiceRequest" ("assignedToId", "body", "createdAt", "id", "plantId", "queryTypeId", "requesterId", "resolvedAt", "status", "subject", "ticketNumber", "updatedAt") SELECT "assignedToId", "body", "createdAt", "id", "plantId", "queryTypeId", "requesterId", "resolvedAt", "status", "subject", "ticketNumber", "updatedAt" FROM "ServiceRequest";
DROP TABLE "ServiceRequest";
ALTER TABLE "new_ServiceRequest" RENAME TO "ServiceRequest";
CREATE UNIQUE INDEX "ServiceRequest_ticketNumber_key" ON "ServiceRequest"("ticketNumber");
CREATE UNIQUE INDEX "ServiceRequest_gmailThreadId_key" ON "ServiceRequest"("gmailThreadId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedEmail_gmailMessageId_key" ON "ProcessedEmail"("gmailMessageId");
