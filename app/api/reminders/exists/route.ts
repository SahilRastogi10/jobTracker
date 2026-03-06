export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const applicationId = searchParams.get("applicationId");
  const date = searchParams.get("date");

  if (!applicationId || !date) {
    return NextResponse.json(
      { error: "applicationId and date are required" },
      { status: 400 }
    );
  }

  const existing = await prisma.reminder.findFirst({
    where: { applicationId, date },
    select: { id: true },
  });

  return NextResponse.json({ exists: Boolean(existing) });
}