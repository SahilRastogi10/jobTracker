export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localYYYYMMDD } from "@/lib/localDate";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const today = localYYYYMMDD();

  const limitParam = searchParams.get("limit");
  let take: number | undefined;

  if (limitParam) {
    take = Number.parseInt(limitParam, 10);

    if (!Number.isFinite(take) || take <= 0) {
      return NextResponse.json(
        { error: "limit must be a positive integer" },
        { status: 400 }
      );
    }
  }

  const items = await prisma.reminder.findMany({
    where: {
      done: false,
      date: { gte: today },
    },
    include: {
      application: { select: { id: true, company: true, role: true } },
    },
    orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }],
    ...(take ? { take } : {}),
  });

  return NextResponse.json({ today, limit: take ?? null, items });
}
