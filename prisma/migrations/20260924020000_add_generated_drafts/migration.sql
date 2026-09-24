-- CreateTable
CREATE TABLE "GeneratedDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "applicationId" TEXT NOT NULL,
    "recruiterId" TEXT,
    "kind" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "editedContent" TEXT,
    "citations" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "reviewedAt" DATETIME,
    "appliedAt" DATETIME,
    CONSTRAINT "GeneratedDraft_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GeneratedDraft_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "Recruiter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FollowUp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "applicationId" TEXT NOT NULL,
    "recruiterId" TEXT,
    "dueDate" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "sentAt" DATETIME,
    "notes" TEXT,
    "draftId" TEXT,
    CONSTRAINT "FollowUp_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FollowUp_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "Recruiter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FollowUp_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "GeneratedDraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FollowUp" ("applicationId", "channel", "createdAt", "dueDate", "id", "notes", "recruiterId", "sentAt", "status", "updatedAt") SELECT "applicationId", "channel", "createdAt", "dueDate", "id", "notes", "recruiterId", "sentAt", "status", "updatedAt" FROM "FollowUp";
DROP TABLE "FollowUp";
ALTER TABLE "new_FollowUp" RENAME TO "FollowUp";
CREATE INDEX "FollowUp_applicationId_idx" ON "FollowUp"("applicationId");
CREATE INDEX "FollowUp_status_dueDate_idx" ON "FollowUp"("status", "dueDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GeneratedDraft_applicationId_createdAt_idx" ON "GeneratedDraft"("applicationId", "createdAt");

