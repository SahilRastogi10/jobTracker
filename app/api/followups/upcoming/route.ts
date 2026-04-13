export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localYYYYMMDD } from "@/lib/localDate";

export async function GET() {
  const today = localYYYYMMDD();

  const applications = await prisma.application.findMany({
    where: {
      followUpDate: { not: null, gte: today },
    },
    select: {
      id: true,
      company: true,
      role: true,
      stage: true,
      followUpDate: true,
    },
    orderBy: [{ followUpDate: "asc" }, { updatedAt: "desc" }],
  });

  const applicationIds = applications.map((application) => application.id);
  const followUpDates = Array.from(
    new Set(
      applications
        .map((application) => application.followUpDate)
        .filter((value): value is string => Boolean(value))
    )
  );

  const reminders =
    applicationIds.length > 0 && followUpDates.length > 0
      ? await prisma.reminder.findMany({
          where: {
            applicationId: { in: applicationIds },
            date: { in: followUpDates },
          },
          select: { applicationId: true, date: true },
        })
      : [];

  const reminderKeys = new Set(
    reminders
      .filter(
        (reminder): reminder is { applicationId: string; date: string } =>
          Boolean(reminder.applicationId)
      )
      .map((reminder) => `${reminder.applicationId}:${reminder.date}`)
  );

  const items = applications.map((application) => ({
    ...application,
    followUpDate: application.followUpDate ?? "",
    hasReminder: reminderKeys.has(
      `${application.id}:${application.followUpDate ?? ""}`
    ),
  }));

  return NextResponse.json({ today, items });
}
