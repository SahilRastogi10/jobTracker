export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { localYYYYMMDD } from "@/src/lib/localDate";

export async function GET() {
  const today = localYYYYMMDD();

  const [goal, note, todaysApps, upcomingFollowups, todaysReminders] =
    await Promise.all([
      prisma.dailyGoal.upsert({
        where: { date: today },
        update: {},
        create: { date: today, targetCount: 5 },
      }),
      prisma.dailyNote.upsert({
        where: { date: today },
        update: {},
        create: { date: today, text: "" },
      }),
      prisma.application.findMany({
        where: { dateApplied: today },
        orderBy: { createdAt: "desc" },
      }),
      prisma.application.findMany({
        where: { followUpDate: { not: null } },
        orderBy: { followUpDate: "asc" },
        take: 10,
      }),
      prisma.reminder.findMany({
        where: { date: today, done: false },
        orderBy: [{ time: "asc" }, { createdAt: "asc" }],
      }),
    ]);

  return NextResponse.json({
    today,
    goal,
    note,
    todaysApps,
    upcomingFollowups,
    todaysReminders,
  });
}