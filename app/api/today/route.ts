export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localYYYYMMDD } from "@/lib/localDate";

export async function GET() {
  const today = localYYYYMMDD();

  const [goal, note, todaysApps, todaysReminders] = await Promise.all([
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
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.reminder.findMany({
      where: { date: today, done: false },
      include: {
        application: { select: { id: true, company: true, role: true } },
      },
      orderBy: [{ time: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return NextResponse.json({
    today,
    goal,
    note,
    todaysApps,
    todaysReminders,
  });
}
