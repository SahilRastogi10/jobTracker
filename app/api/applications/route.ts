export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localYYYYMMDD } from "@/lib/localDate";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date"); // YYYY-MM-DD
  const stage = searchParams.get("stage");
  const q = searchParams.get("q");

  const where: any = {};
  if (date) where.dateApplied = date;
  if (stage) where.stage = stage;

  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [{ company: { contains: term } }, { role: { contains: term } }];
  }

  const items = await prisma.application.findMany({
    where,
    orderBy: [{ dateApplied: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const body = await req.json();

  const company = String(body.company ?? "").trim();
  const role = String(body.role ?? "").trim();

  if (!company || !role) {
    return NextResponse.json(
      { error: "company and role are required" },
      { status: 400 }
    );
  }

  const created = await prisma.application.create({
    data: {
      company,
      role,
      link: body.link ? String(body.link).trim() : null,
      stage: body.stage ? String(body.stage) : "applied",
      dateApplied: body.dateApplied ? String(body.dateApplied) : localYYYYMMDD(),
      notes: body.notes ? String(body.notes) : null,
      followUpDate: body.followUpDate ? String(body.followUpDate) : null,
      recruiterName: body.recruiterName ? String(body.recruiterName).trim() : null,
      recruiterTitle: body.recruiterTitle ? String(body.recruiterTitle).trim() : null,
      recruiterEmail: body.recruiterEmail ? String(body.recruiterEmail).trim() : null,
      recruiterLinkedIn: body.recruiterLinkedIn ? String(body.recruiterLinkedIn).trim() : null,
      recruiterSource: body.recruiterSource ? String(body.recruiterSource) : null,
    },
  });

  return NextResponse.json({ item: created }, { status: 201 });
}
