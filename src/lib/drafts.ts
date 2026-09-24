import type { GeneratedDraft } from "@prisma/client";
import type { RetrievedMatch } from "@/lib/retrieval";

export const DRAFT_KINDS = ["follow_up_email", "qa_answer"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const DRAFT_STATUSES = ["pending_review", "approved", "rejected"] as const;

// Every way a draft can leave the review queue. All of them require approval.
export const DRAFT_APPLY_TARGETS = ["follow_up", "notes", "export"] as const;
export type DraftApplyTarget = (typeof DRAFT_APPLY_TARGETS)[number];

export function finalDraftText(draft: Pick<GeneratedDraft, "content" | "editedContent">) {
  return draft.editedContent ?? draft.content;
}

function parseCitations(value: string): RetrievedMatch[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeDraft(draft: GeneratedDraft) {
  return {
    ...draft,
    citations: parseCitations(draft.citations),
    finalText: finalDraftText(draft),
  };
}
