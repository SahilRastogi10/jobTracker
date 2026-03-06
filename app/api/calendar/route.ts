export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const [apps, rems] = await Promise.all([
    prisma.application.findMany({
      where: { dateApplied: { gte: start, lte: end } },
      select: { id: true, dateApplied: true, company: true, role: true, stage: true },
      orderBy: [{ dateApplied: "asc" }, { createdAt: "asc" }],
    }),
    prisma.reminder.findMany({
      where: { date: { gte: start, lte: end } },
      select: { id: true, date: true, time: true, message: true, done: true, applicationId: true },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    }),
  ]);

  const appsByDate: Record<string, number> = {};
  for (const a of apps) appsByDate[a.dateApplied] = (appsByDate[a.dateApplied] ?? 0) + 1;

  const remsByDate: Record<string, number> = {};
  for (const r of rems) remsByDate[r.date] = (remsByDate[r.date] ?? 0) + 1;

  return NextResponse.json({
    start,
    end,
    appsByDate,
    remsByDate,
  });
}