export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const MIN_TEXT_LENGTH = 200;
const MAX_TEXT_LENGTH = 50000;

const listSelect = {
  id: true,
  name: true,
  fileName: true,
  isDefault: true,
  createdAt: true,
} as const;

export async function GET() {
  const items = await prisma.resume.findMany({
    select: listSelect,
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ items });
}

// PDFs are read in the browser (see src/lib/pdfText.ts), so this receives plain text either way.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const fileName = body.fileName ? String(body.fileName).slice(0, 200) : null;
  const name = String(body.name ?? "").trim() || fileName?.replace(/\.pdf$/i, "") || "";
  const text = String(body.text ?? "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);

  if (text.length < MIN_TEXT_LENGTH) {
    return NextResponse.json(
      {
        error: fileName
          ? "This PDF has almost no selectable text (it may be a scanned image). Paste the resume text instead."
          : "Paste the full resume text.",
      },
      { status: 400 }
    );
  }

  const isFirst = (await prisma.resume.count()) === 0;
  const item = await prisma.resume.create({
    data: { name: name.slice(0, 80) || "My resume", fileName, text, isDefault: isFirst },
    select: listSelect,
  });

  return NextResponse.json({ item }, { status: 201 });
}
