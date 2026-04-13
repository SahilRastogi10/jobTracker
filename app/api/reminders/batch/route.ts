export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(req: Request) {
  const body = await req.json();
  const ids = Array.isArray(body.ids)
    ? body.ids.map((id: unknown) => String(id).trim()).filter(Boolean)
    : [];
  const done = body.done !== undefined ? Boolean(body.done) : true;

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "ids must be a non-empty array" },
      { status: 400 }
    );
  }

  const result = await prisma.reminder.updateMany({
    where: { id: { in: ids } },
    data: { done },
  });

  return NextResponse.json({ updatedCount: result.count });
}
