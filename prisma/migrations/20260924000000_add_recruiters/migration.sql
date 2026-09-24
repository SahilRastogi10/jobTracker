-- CreateTable
CREATE TABLE "Recruiter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "email" TEXT,
    "linkedIn" TEXT,
    "source" TEXT,
    CONSTRAINT "Recruiter_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Move existing recruiter columns into Recruiter rows
INSERT INTO "Recruiter" ("id", "createdAt", "updatedAt", "applicationId", "name", "title", "email", "linkedIn", "source")
SELECT lower(hex(randomblob(12))), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, "id",
       NULLIF(TRIM("recruiterName"), ''), NULLIF(TRIM("recruiterTitle"), ''), NULLIF(TRIM("recruiterEmail"), ''),
       NULLIF(TRIM("recruiterLinkedIn"), ''), NULLIF(TRIM("recruiterSource"), '')
FROM "Application"
WHERE COALESCE(TRIM("recruiterName"), '') <> '' OR COALESCE(TRIM("recruiterTitle"), '') <> ''
   OR COALESCE(TRIM("recruiterEmail"), '') <> '' OR COALESCE(TRIM("recruiterLinkedIn"), '') <> ''
   OR COALESCE(TRIM("recruiterSource"), '') <> '';

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
    "notes" TEXT,
    "followUpDate" TEXT
);
INSERT INTO "new_Application" ("company", "createdAt", "dateApplied", "followUpDate", "id", "link", "notes", "role", "stage", "updatedAt") SELECT "company", "createdAt", "dateApplied", "followUpDate", "id", "link", "notes", "role", "stage", "updatedAt" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Recruiter_applicationId_idx" ON "Recruiter"("applicationId");

