export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function getIdFromUrl(req: Request): string | null {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  // /api/resumes/:id
  const id = parts[parts.length - 1];
  return id ? id : null;
}

export async function GET(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const item = await prisma.resume.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item });
}

// Rename, or make this the default resume.
export async function PATCH(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await prisma.resume.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = body.name !== undefined ? String(body.name).trim().slice(0, 80) : undefined;
  if (name === "") return NextResponse.json({ error: "name can't be empty" }, { status: 400 });

  const item = await prisma.$transaction(async (tx) => {
    if (body.isDefault === true) {
      await tx.resume.updateMany({ where: { NOT: { id } }, data: { isDefault: false } });
    }
    return tx.resume.update({
      where: { id },
      data: { name, isDefault: body.isDefault === true ? true : undefined },
      select: { id: true, name: true, fileName: true, isDefault: true, createdAt: true },
    });
  });

  return NextResponse.json({ item });
}

export async function DELETE(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await prisma.resume.findUnique({ where: { id }, select: { isDefault: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.resume.delete({ where: { id } });
    // Keep a default whenever any resume is left.
    if (existing.isDefault) {
      const newest = await tx.resume.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
      if (newest) await tx.resume.update({ where: { id: newest.id }, data: { isDefault: true } });
    }
  });

  return NextResponse.json({ ok: true });
}
