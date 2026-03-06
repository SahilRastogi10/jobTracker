export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";

function esc(v: any) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export async function GET() {
  const items = await prisma.application.findMany({
    orderBy: [{ dateApplied: "desc" }, { createdAt: "desc" }],
  });

  const header = [
    "id",
    "company",
    "role",
    "stage",
    "dateApplied",
    "followUpDate",
    "link",
    "notes",
    "createdAt",
    "updatedAt",
  ];

  const rows = items.map((a) => [
    a.id,
    a.company,
    a.role,
    a.stage,
    a.dateApplied,
    a.followUpDate ?? "",
    a.link ?? "",
    a.notes ?? "",
    a.createdAt.toISOString(),
    a.updatedAt.toISOString(),
  ]);

  const csv =
    header.join(",") +
    "\n" +
    rows.map((r) => r.map(esc).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="applications.csv"',
    },
  });
}