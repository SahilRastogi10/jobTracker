export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkExtensionToken, normalizeJobUrl } from "@/lib/extension";
import { localYYYYMMDD } from "@/lib/localDate";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function addDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  return localYYYYMMDD(new Date(y, m - 1, d + days));
}

function clip(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

// Connection check for the extension's options page.
export async function GET(req: Request) {
  const authError = checkExtensionToken(req);
  if (authError) return unauthorized(authError);

  return NextResponse.json({ ok: true });
}

// Saves a job captured by the extension, or returns the existing record for the same job.
export async function POST(req: Request) {
  const authError = checkExtensionToken(req);
  if (authError) return unauthorized(authError);

  const body = await req.json().catch(() => ({}));
  const company = clip(body.company, 120);
  const role = clip(body.role, 160);
  const link = clip(body.link, 1000) || null;
  const source = clip(body.source, 80);

  if (!company || !role) {
    return NextResponse.json({ error: "company and role are required" }, { status: 400 });
  }

  const dateApplied = DATE_PATTERN.test(String(body.dateApplied ?? ""))
    ? String(body.dateApplied)
    : localYYYYMMDD();

  const normalizedLink = normalizeJobUrl(link);
  const candidates = await prisma.application.findMany({
    where: {
      OR: [
        { link: { not: null } },
        { company, role, dateApplied },
      ],
    },
    select: { id: true, company: true, role: true, link: true, dateApplied: true },
  });

  const existing = candidates.find(
    (item) =>
      (normalizedLink && normalizeJobUrl(item.link) === normalizedLink) ||
      (item.company.toLowerCase() === company.toLowerCase() &&
        item.role.toLowerCase() === role.toLowerCase() &&
        item.dateApplied === dateApplied)
  );

  if (existing) {
    return NextResponse.json({ item: existing, duplicate: true });
  }

  const followUpInDays = Number(body.followUpInDays);
  const planFollowUp = Number.isInteger(followUpInDays) && followUpInDays > 0 && followUpInDays <= 60;

  const created = await prisma.application.create({
    data: {
      company,
      role,
      link,
      stage: "applied",
      dateApplied,
      notes: source ? `Captured by the browser extension from ${source}.` : null,
      followUps: planFollowUp
        ? { create: { dueDate: addDays(dateApplied, followUpInDays) } }
        : undefined,
    },
    select: { id: true, company: true, role: true, link: true, dateApplied: true },
  });

  // Index the posting for the assistant in the background; the extension doesn't wait on it.
  if (link && body.syncContext !== false) {
    void fetch(new URL(`/api/applications/${created.id}/context`, req.url), {
      method: "POST",
    }).catch(() => {});
  }

  return NextResponse.json({ item: created, duplicate: false }, { status: 201 });
}

// Undo for the "Saved to Job Tracker" toast.
export async function DELETE(req: Request) {
  const authError = checkExtensionToken(req);
  if (authError) return unauthorized(authError);

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const existing = await prisma.application.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.application.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
