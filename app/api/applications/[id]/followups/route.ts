export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  followUpFieldsFromBody,
  followUpListInclude,
  serializeFollowUp,
} from "@/lib/followUps";

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

  const followUps = await prisma.followUp.findMany({
    where: { applicationId: id },
    include: followUpListInclude,
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ items: followUps.map(serializeFollowUp) });
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
  if (body.dueDate === undefined) {
    return NextResponse.json({ error: "dueDate is required" }, { status: 400 });
  }

  const parsed = await followUpFieldsFromBody(body, id);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const created = await prisma.followUp.create({
    data: { applicationId: id, ...parsed.data, dueDate: parsed.data.dueDate! },
    include: followUpListInclude,
  });

  return NextResponse.json({ item: serializeFollowUp(created) }, { status: 201 });
}
