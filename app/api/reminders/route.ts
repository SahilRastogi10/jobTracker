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
  const applicationId = body.applicationId ? String(body.applicationId) : null;

  if (!date || !time || !message) {
    return NextResponse.json(
      { error: "date, time, message are required" },
      { status: 400 }
    );
  }

  const created = await prisma.reminder.create({
    data: { date, time, message, applicationId },
  });

  return NextResponse.json({ item: created }, { status: 201 });
}
