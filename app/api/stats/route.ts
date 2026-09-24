export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localYYYYMMDD } from "@/lib/localDate";

export async function GET() {
  const today = localYYYYMMDD();

  const [
    totalApplications,
    stageGroups,
    pendingReminders,
    doneReminders,
    overdueFollowUps,
    upcomingFollowUps,
    sentFollowUps,
  ] = await Promise.all([
    prisma.application.count(),
    prisma.application.groupBy({
      by: ["stage"],
      _count: { _all: true },
    }),
    prisma.reminder.count({ where: { done: false } }),
    prisma.reminder.count({ where: { done: true } }),
    prisma.followUp.count({ where: { status: "planned", dueDate: { lt: today } } }),
    prisma.followUp.count({ where: { status: "planned", dueDate: { gte: today } } }),
    prisma.followUp.count({ where: { status: "sent" } }),
  ]);

  const stageCounts = Object.fromEntries(
    stageGroups.map((group) => [group.stage, group._count._all])
  );

  return NextResponse.json({
    today,
    totalApplications,
    stageCounts,
    reminders: {
      pending: pendingReminders,
      done: doneReminders,
    },
    followUps: {
      overdue: overdueFollowUps,
      upcoming: upcomingFollowUps,
      sent: sentFollowUps,
    },
  });
}
