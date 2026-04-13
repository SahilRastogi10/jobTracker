export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const items = await prisma.application.findMany({
    select: { id: true, company: true, role: true, stage: true, dateApplied: true },
    orderBy: [{ dateApplied: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({ items });
}
