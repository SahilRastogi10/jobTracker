export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeDraft } from "@/lib/drafts";

function getIdFromUrl(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const draftIndex = parts.findIndex((part) => part === "drafts");
  const id = draftIndex >= 0 ? parts[draftIndex + 1] : null;
  return id ? id : null;
}

// Review actions: edit sends the draft back to review, approve/reject record the decision.
export async function PATCH(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const draft = await prisma.generatedDraft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "edit") {
    const content = String(body.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const updated = await prisma.generatedDraft.update({
      where: { id },
      data: {
        editedContent: content === draft.content ? null : content,
        status: "pending_review",
        reviewedAt: null,
      },
    });
    return NextResponse.json({ item: serializeDraft(updated) });
  }

  if (action === "approve" || action === "reject") {
    if (action === "approve" && draft.status !== "pending_review") {
      return NextResponse.json(
        { error: "Only drafts pending review can be approved." },
        { status: 409 }
      );
    }

    const updated = await prisma.generatedDraft.update({
      where: { id },
      data: {
        status: action === "approve" ? "approved" : "rejected",
        reviewedAt: new Date(),
      },
    });
    return NextResponse.json({ item: serializeDraft(updated) });
  }

  return NextResponse.json(
    { error: "action must be one of edit, approve, reject" },
    { status: 400 }
  );
}

export async function DELETE(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const draft = await prisma.generatedDraft.findUnique({ where: { id }, select: { id: true } });
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.generatedDraft.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
