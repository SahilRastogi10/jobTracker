export const runtime = "nodejs";
export const dynamic = "force-dynamic";


import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localYYYYMMDD } from "@/lib/localDate";

// Saves the note for body.date (YYYY-MM-DD), or today's note when no date is given.
export async function PATCH(req: Request) {
  const body = await req.json();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date ?? ""))
    ? String(body.date)
    : localYYYYMMDD();
  const text = String(body.text ?? "");

  const note = await prisma.dailyNote.upsert({
    where: { date },
    update: { text },
    create: { date, text },
  });

  return NextResponse.json({ note });
}
