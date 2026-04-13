export const runtime = "nodejs";
export const dynamic = "force-dynamic";


import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localYYYYMMDD } from "@/lib/localDate";

export async function PATCH(req: Request) {
  const body = await req.json();
  const today = localYYYYMMDD();
  const text = String(body.text ?? "");

  const note = await prisma.dailyNote.upsert({
    where: { date: today },
    update: { text },
    create: { date: today, text },
  });

  return NextResponse.json({ note });
}
