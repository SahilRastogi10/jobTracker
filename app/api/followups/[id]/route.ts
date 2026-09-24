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
  // /api/followups/:id
  const id = parts[parts.length - 1];
  return id ? id : null;
}

export async function PATCH(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await prisma.followUp.findUnique({
    where: { id },
    select: { id: true, applicationId: true, dueDate: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = await followUpFieldsFromBody(body, existing.applicationId);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const updated = await prisma.$transaction(async (tx) => {
    // Keep linked reminders on the follow-up's date when it moves.
    if (parsed.data.dueDate && parsed.data.dueDate !== existing.dueDate) {
      await tx.reminder.updateMany({
        where: { followUpId: id, done: false },
        data: { date: parsed.data.dueDate },
      });
    }

    return tx.followUp.update({
      where: { id },
      data: parsed.data,
      include: followUpListInclude,
    });
  });

  return NextResponse.json({ item: serializeFollowUp(updated) });
}

export async function DELETE(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await prisma.followUp.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.followUp.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
