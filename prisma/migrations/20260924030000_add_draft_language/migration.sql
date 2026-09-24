-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GeneratedDraft" (
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
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "reviewedAt" DATETIME,
    "appliedAt" DATETIME,
    CONSTRAINT "GeneratedDraft_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GeneratedDraft_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "Recruiter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GeneratedDraft" ("applicationId", "appliedAt", "citations", "content", "createdAt", "editedContent", "id", "kind", "model", "prompt", "provider", "recruiterId", "reviewedAt", "status", "updatedAt") SELECT "applicationId", "appliedAt", "citations", "content", "createdAt", "editedContent", "id", "kind", "model", "prompt", "provider", "recruiterId", "reviewedAt", "status", "updatedAt" FROM "GeneratedDraft";
DROP TABLE "GeneratedDraft";
ALTER TABLE "new_GeneratedDraft" RENAME TO "GeneratedDraft";
CREATE INDEX "GeneratedDraft_applicationId_createdAt_idx" ON "GeneratedDraft"("applicationId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

