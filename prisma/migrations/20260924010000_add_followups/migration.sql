-- CreateTable
CREATE TABLE "FollowUp" (
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
    CONSTRAINT "FollowUp_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FollowUp_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "Recruiter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Turn each existing follow-up date into a planned FollowUp row
INSERT INTO "FollowUp" ("id", "createdAt", "updatedAt", "applicationId", "dueDate", "channel", "status")
SELECT lower(hex(randomblob(12))), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, "id", TRIM("followUpDate"), 'email', 'planned'
FROM "Application"
WHERE COALESCE(TRIM("followUpDate"), '') <> '';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "link" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'applied',
    "dateApplied" TEXT NOT NULL,
    "notes" TEXT
);
INSERT INTO "new_Application" ("company", "createdAt", "dateApplied", "id", "link", "notes", "role", "stage", "updatedAt") SELECT "company", "createdAt", "dateApplied", "id", "link", "notes", "role", "stage", "updatedAt" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE TABLE "new_Reminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "applicationId" TEXT,
    "followUpId" TEXT,
    CONSTRAINT "Reminder_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reminder_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Link reminders that were created for an application's follow-up date
INSERT INTO "new_Reminder" ("applicationId", "createdAt", "date", "done", "id", "message", "time", "followUpId")
SELECT "applicationId", "createdAt", "date", "done", "id", "message", "time",
       (SELECT "FollowUp"."id" FROM "FollowUp"
        WHERE "FollowUp"."applicationId" = "Reminder"."applicationId" AND "FollowUp"."dueDate" = "Reminder"."date"
        LIMIT 1)
FROM "Reminder";
DROP TABLE "Reminder";
ALTER TABLE "new_Reminder" RENAME TO "Reminder";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FollowUp_applicationId_idx" ON "FollowUp"("applicationId");

-- CreateIndex
CREATE INDEX "FollowUp_status_dueDate_idx" ON "FollowUp"("status", "dueDate");

