export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  DRAFT_APPLY_TARGETS,
  type DraftApplyTarget,
  finalDraftText,
  serializeDraft,
} from "@/lib/drafts";
import { localYYYYMMDD } from "@/lib/localDate";

function getIdFromUrl(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const draftIndex = parts.findIndex((part) => part === "drafts");
  const id = draftIndex >= 0 ? parts[draftIndex + 1] : null;
  return id ? id : null;
}

// The only way generated text leaves the review queue. Unapproved drafts are refused.
export async function POST(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const draft = await prisma.generatedDraft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (draft.status !== "approved") {
    return NextResponse.json(
      { error: "This draft must be approved before it can be used." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const target = String(body.target ?? "") as DraftApplyTarget;
  if (!DRAFT_APPLY_TARGETS.includes(target)) {
    return NextResponse.json(
      { error: `target must be one of ${DRAFT_APPLY_TARGETS.join(", ")}` },
      { status: 400 }
    );
  }

  const text = finalDraftText(draft);

  if (target === "follow_up") {
    if (draft.kind !== "follow_up_email") {
      return NextResponse.json(
        { error: "Only follow-up drafts can be attached to a follow-up." },
        { status: 400 }
      );
    }

    const followUp = await prisma.followUp.findFirst({
      where: { id: String(body.followUpId ?? ""), applicationId: draft.applicationId },
      select: { id: true, status: true },
    });
    if (!followUp) {
      return NextResponse.json(
        { error: "followUpId does not belong to this application" },
        { status: 400 }
      );
    }
    if (followUp.status !== "planned") {
      return NextResponse.json(
        { error: "Drafts can only be attached to planned follow-ups." },
        { status: 409 }
      );
    }

    await prisma.followUp.update({ where: { id: followUp.id }, data: { draftId: draft.id } });
  }

  if (target === "notes") {
    const application = await prisma.application.findUnique({
      where: { id: draft.applicationId },
      select: { notes: true },
    });
    const entry = `[Assistant, approved ${localYYYYMMDD()}] ${draft.prompt}\n${text}`;
    const notes = application?.notes?.trim() ? `${application.notes.trim()}\n\n${entry}` : entry;

    await prisma.application.update({
      where: { id: draft.applicationId },
      data: { notes },
    });
  }

  const updated = await prisma.generatedDraft.update({
    where: { id },
    data: { appliedAt: new Date() },
  });

  return NextResponse.json({ item: serializeDraft(updated), text });
}
