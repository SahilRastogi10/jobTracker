export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function getIdFromUrl(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // /api/applications/:id
  const id = parts[parts.length - 1];
  return id ? id : null;
}

export async function GET(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const item = await prisma.application.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item });
}

export async function PATCH(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json();

  const updated = await prisma.application.update({
    where: { id },
    data: {
      company: body.company !== undefined ? String(body.company).trim() : undefined,
      role: body.role !== undefined ? String(body.role).trim() : undefined,
      link:
        body.link !== undefined
          ? body.link
            ? String(body.link).trim()
            : null
          : undefined,
      stage: body.stage !== undefined ? String(body.stage) : undefined,
      notes:
        body.notes !== undefined
          ? body.notes
            ? String(body.notes)
            : null
          : undefined,
      followUpDate:
        body.followUpDate !== undefined
          ? body.followUpDate
            ? String(body.followUpDate)
            : null
          : undefined,
      recruiterName:
        body.recruiterName !== undefined
          ? body.recruiterName
            ? String(body.recruiterName).trim()
            : null
          : undefined,
      recruiterTitle:
        body.recruiterTitle !== undefined
          ? body.recruiterTitle
            ? String(body.recruiterTitle).trim()
            : null
          : undefined,
      recruiterEmail:
        body.recruiterEmail !== undefined
          ? body.recruiterEmail
            ? String(body.recruiterEmail).trim()
            : null
          : undefined,
      recruiterLinkedIn:
        body.recruiterLinkedIn !== undefined
          ? body.recruiterLinkedIn
            ? String(body.recruiterLinkedIn).trim()
            : null
          : undefined,
      recruiterSource:
        body.recruiterSource !== undefined
          ? body.recruiterSource
            ? String(body.recruiterSource)
            : null
          : undefined,
      dateApplied: body.dateApplied !== undefined ? String(body.dateApplied) : undefined,
    },
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.application.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
