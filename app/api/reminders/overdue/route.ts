export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localYYYYMMDD } from "@/lib/localDate";

export async function GET() {
  const today = localYYYYMMDD();

  const items = await prisma.reminder.findMany({
    where: {
      done: false,
      date: { lt: today },
    },
    include: {
      application: { select: { id: true, company: true, role: true } },
    },
    orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ today, items });
}
