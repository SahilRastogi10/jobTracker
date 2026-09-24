export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DRAFT_KINDS, type DraftKind, serializeDraft } from "@/lib/drafts";
import { localYYYYMMDD } from "@/lib/localDate";
import {
  answerWithRetrievedContext,
  draftFollowUpMessage,
  getRagProvider,
  getResponseModel,
} from "@/lib/rag";
import { ContextUnavailableError, matchLabel, retrieveContext } from "@/lib/retrieval";

function getIdFromUrl(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const appIndex = parts.findIndex((part) => part === "applications");
  const id = appIndex >= 0 ? parts[appIndex + 1] : null;
  return id ? id : null;
}

function daysBetween(fromYmd: string, toYmd: string) {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export async function GET(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const drafts = await prisma.generatedDraft.findMany({
    where: { applicationId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items: drafts.map(serializeDraft) });
}

export async function POST(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      followUps: { orderBy: { dueDate: "asc" } },
      recruiters: true,
    },
  });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "") as DraftKind;
  if (!DRAFT_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: `kind must be one of ${DRAFT_KINDS.join(", ")}` },
      { status: 400 }
    );
  }

  const instructions = String(body.instructions ?? "").trim();

  try {
    if (kind === "qa_answer") {
      const question = String(body.question ?? "").trim();
      if (!question) {
        return NextResponse.json({ error: "question is required" }, { status: 400 });
      }

      const matches = await retrieveContext(id, question);
      const content = await answerWithRetrievedContext(
        `Application: ${application.company} | ${application.role}\n${question}`,
        matches.map((match) => ({ label: matchLabel(match), text: match.content }))
      );

      const draft = await prisma.generatedDraft.create({
        data: {
          applicationId: id,
          kind,
          prompt: question,
          content,
          citations: JSON.stringify(matches),
          provider: getRagProvider(),
          model: getResponseModel(),
        },
      });

      return NextResponse.json({ item: serializeDraft(draft) }, { status: 201 });
    }

    const followUp = body.followUpId
      ? application.followUps.find((item) => item.id === String(body.followUpId))
      : undefined;
    if (body.followUpId && !followUp) {
      return NextResponse.json(
        { error: "followUpId does not belong to this application" },
        { status: 400 }
      );
    }

    const recruiterId = body.recruiterId ? String(body.recruiterId) : followUp?.recruiterId;
    const recruiter = recruiterId
      ? application.recruiters.find((item) => item.id === recruiterId)
      : undefined;
    if (recruiterId && !recruiter) {
      return NextResponse.json(
        { error: "recruiterId does not belong to this application" },
        { status: 400 }
      );
    }

    const channel = followUp?.channel ?? "email";
    const today = localYYYYMMDD();
    const sentFollowUps = application.followUps.filter((item) => item.status === "sent");

    const applicantName = process.env.APPLICANT_NAME?.trim();
    const details = [
      applicantName ? `Applicant: ${applicantName}` : null,
      `Company: ${application.company}`,
      `Role: ${application.role}`,
      `Stage: ${application.stage}`,
      `Applied on ${application.dateApplied} (${daysBetween(application.dateApplied, today)} days ago)`,
      `Channel: ${channel}`,
      recruiter
        ? `Recipient: ${[recruiter.name, recruiter.title].filter(Boolean).join(", ") || recruiter.email}`
        : "Recipient: unknown (no name)",
      sentFollowUps.length > 0
        ? `Previous follow-ups already sent on: ${sentFollowUps.map((item) => item.dueDate).join(", ")}`
        : "This is the first follow-up.",
      instructions ? `Applicant's instructions: ${instructions}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const matches = await retrieveContext(
      id,
      `${application.role} at ${application.company}: responsibilities, requirements, team. ${instructions}`
    );
    const content = await draftFollowUpMessage(
      details,
      channel,
      matches.map((match) => ({ label: matchLabel(match), text: match.content }))
    );

    const draft = await prisma.generatedDraft.create({
      data: {
        applicationId: id,
        recruiterId: recruiter?.id ?? null,
        kind,
        prompt: details,
        content,
        citations: JSON.stringify(matches),
        provider: getRagProvider(),
        model: getResponseModel(),
      },
    });

    return NextResponse.json({ item: serializeDraft(draft) }, { status: 201 });
  } catch (error) {
    if (error instanceof ContextUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Could not generate a draft.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
