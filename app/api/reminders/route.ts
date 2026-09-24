export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localYYYYMMDD } from "@/lib/localDate";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? localYYYYMMDD();

  const items = await prisma.reminder.findMany({
  where: { date },
  include: {
    application: {
      select: { id: true, company: true, role: true },
    },
  },
  orderBy: [{ time: "asc" }, { createdAt: "asc" }],
});

  return NextResponse.json({ date, items });
}

export async function POST(req: Request) {
  const body = await req.json();

  const date = String(body.date ?? "").trim();
  const time = String(body.time ?? "").trim();
  const message = String(body.message ?? "").trim();
  let applicationId = body.applicationId ? String(body.applicationId) : null;
  const followUpId = body.followUpId ? String(body.followUpId) : null;

  if (!date || !time || !message) {
    return NextResponse.json(
      { error: "date, time, message are required" },
      { status: 400 }
    );
  }

  if (followUpId) {
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      select: { applicationId: true },
    });
    if (!followUp) {
      return NextResponse.json({ error: "followUpId not found" }, { status: 400 });
    }
    applicationId = followUp.applicationId;
  }

  const created = await prisma.reminder.create({
    data: { date, time, message, applicationId, followUpId },
  });

  return NextResponse.json({ item: created }, { status: 201 });
}
