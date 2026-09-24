import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const FOLLOW_UP_STATUSES = ["planned", "sent", "skipped"] as const;
export const FOLLOW_UP_CHANNELS = ["email", "linkedin", "other"] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ParsedFollowUp =
  | { error: string }
  | {
      data: {
        dueDate?: string;
        channel?: string;
        status?: string;
        sentAt?: Date | null;
        notes?: string | null;
        recruiterId?: string | null;
        draftId?: null;
      };
    };

// Only fields present in the body are returned, so the result works for both create and PATCH.
export async function followUpFieldsFromBody(
  body: Record<string, unknown>,
  applicationId: string
): Promise<ParsedFollowUp> {
  const data: Extract<ParsedFollowUp, { data: unknown }>["data"] = {};

  if (body.dueDate !== undefined) {
    const dueDate = String(body.dueDate ?? "").trim();
    if (!DATE_PATTERN.test(dueDate)) return { error: "dueDate must be YYYY-MM-DD" };
    data.dueDate = dueDate;
  }

  if (body.channel !== undefined) {
    const channel = String(body.channel);
    if (!(FOLLOW_UP_CHANNELS as readonly string[]).includes(channel)) {
      return { error: `channel must be one of ${FOLLOW_UP_CHANNELS.join(", ")}` };
    }
    data.channel = channel;
  }

  if (body.status !== undefined) {
    const status = String(body.status);
    if (!(FOLLOW_UP_STATUSES as readonly string[]).includes(status)) {
      return { error: `status must be one of ${FOLLOW_UP_STATUSES.join(", ")}` };
    }
    data.status = status;
    data.sentAt = status === "sent" ? new Date() : null;
  }

  if (body.notes !== undefined) {
    const notes = String(body.notes ?? "").trim();
    data.notes = notes ? notes : null;
  }

  if (body.recruiterId !== undefined) {
    const recruiterId = body.recruiterId ? String(body.recruiterId) : null;
    if (recruiterId) {
      const recruiter = await prisma.recruiter.findFirst({
        where: { id: recruiterId, applicationId },
        select: { id: true },
      });
      if (!recruiter) return { error: "recruiterId does not belong to this application" };
    }
    data.recruiterId = recruiterId;
  }

  // Drafts are attached only through /api/drafts/[id]/apply; PATCH can only detach one.
  if (body.draftId === null) data.draftId = null;

  return { data };
}

export const followUpListInclude = {
  application: { select: { id: true, company: true, role: true, stage: true } },
  recruiter: { select: { id: true, name: true, email: true } },
  draft: { select: { id: true, status: true } },
  _count: { select: { reminders: true } },
} satisfies Prisma.FollowUpInclude;

type FollowUpWithRelations = Prisma.FollowUpGetPayload<{ include: typeof followUpListInclude }>;

export function serializeFollowUp(followUp: FollowUpWithRelations) {
  const { _count, ...rest } = followUp;
  return { ...rest, hasReminder: _count.reminders > 0 };
}

export async function listPlannedFollowUps(dueDate: Prisma.StringFilter) {
  const followUps = await prisma.followUp.findMany({
    where: { status: "planned", dueDate },
    include: followUpListInclude,
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  return followUps.map(serializeFollowUp);
}
