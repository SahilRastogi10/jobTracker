export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function getIdFromUrl(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

export async function PATCH(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json();

  const data: any = {};
  if (body.done !== undefined) data.done = Boolean(body.done);
  if (body.message !== undefined) data.message = String(body.message ?? "");
  if (body.time !== undefined) data.time = String(body.time ?? "");
  if (body.date !== undefined) data.date = String(body.date ?? "");

  const updated = await prisma.reminder.update({
    where: { id },
    data,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.reminder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
