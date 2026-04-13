export const runtime = "nodejs";
export const dynamic = "force-dynamic";


import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localYYYYMMDD } from "@/lib/localDate";

export async function PATCH(req: Request) {
  const body = await req.json();
  const today = localYYYYMMDD();

  const targetCount = Number(body.targetCount);

  if (!Number.isFinite(targetCount) || targetCount < 0 || targetCount > 500) {
    return NextResponse.json({ error: "Invalid targetCount" }, { status: 400 });
  }

  const goal = await prisma.dailyGoal.upsert({
    where: { date: today },
    update: { targetCount },
    create: { date: today, targetCount },
  });

  return NextResponse.json({ goal });
}
