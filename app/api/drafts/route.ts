export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DRAFT_STATUSES } from "@/lib/drafts";

// Drafts across all applications, e.g. the review queue on the Today page.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  if (status && !(DRAFT_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${DRAFT_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const items = await prisma.generatedDraft.findMany({
    where: status ? { status } : undefined,
    select: {
      id: true,
      createdAt: true,
      kind: true,
      status: true,
      application: { select: { id: true, company: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items });
}
