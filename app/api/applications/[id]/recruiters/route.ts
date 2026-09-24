export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recruiterFieldsFromBody } from "@/lib/recruiters";

function getIdFromUrl(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const appIndex = parts.findIndex((part) => part === "applications");
  const id = appIndex >= 0 ? parts[appIndex + 1] : null;
  return id ? id : null;
}

export async function GET(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const items = await prisma.recruiter.findMany({
    where: { applicationId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const application = await prisma.application.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  const item = await prisma.recruiter.create({
    data: { applicationId: id, ...recruiterFieldsFromBody(body) },
  });

  return NextResponse.json({ item }, { status: 201 });
}
