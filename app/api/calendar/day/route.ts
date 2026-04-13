export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
  }

  const [applications, reminders] = await Promise.all([
    prisma.application.findMany({
      where: { dateApplied: date },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.reminder.findMany({
      where: { date },
      include: {
        application: { select: { id: true, company: true, role: true } },
      },
      orderBy: [{ time: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return NextResponse.json({ date, applications, reminders });
}
