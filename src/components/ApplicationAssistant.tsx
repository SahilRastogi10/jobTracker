"use client";

import { useEffect, useState } from "react";

type DraftKind = "follow_up_email" | "qa_answer";
type DraftStatus = "pending_review" | "approved" | "rejected";

type Citation = {
  id: string;
  score: number;
  content: string;
  sourceType: string;
  title: string;
  url?: string | null;
};

type Draft = {
  id: string;
  createdAt: string;
  kind: DraftKind;
  prompt: string;
  content: string;
  editedContent?: string | null;
  finalText: string;
  citations: Citation[];
  provider: string;
  model: string;
  status: DraftStatus;
  reviewedAt?: string | null;
  appliedAt?: string | null;
  recruiterId?: string | null;
};

type AssistantRecruiter = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type AssistantFollowUp = {
  id: string;
  dueDate: string;
  channel: string;
  status: string;
  recruiterId?: string | null;
};

type ApplicationAssistantProps = {
  applicationId: string;
  hasContext: boolean;
  recruiters: AssistantRecruiter[];
  followUps: AssistantFollowUp[];
  onFollowUpsChanged: () => void;
  onApplicationChanged: () => void;
};

const QUICK_QUESTIONS = [
  "Summarize this role and the biggest priorities.",
  "What skills or experience should I emphasize if I hear back?",
  "What should I ask the recruiter about this role?",
] as const;

const STATUS_BADGES: Record<DraftStatus, { label: string; className: string }> = {
  pending_review: { label: "Needs review", className: "badge badge-applied" },
  approved: { label: "Approved", className: "badge badge-offer" },
  rejected: { label: "Rejected", className: "badge badge-rejected" },
};

function formatSourceType(sourceType: string) {
  return sourceType
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function recruiterLabel(recruiter: AssistantRecruiter, index: number) {
  return recruiter.name || recruiter.email || `Recruiter ${index + 1}`;
}

// Drafts for email start with "Subject: ..." followed by the body.
function splitSubject(text: string) {
  const match = text.match(/^Subject:\s*(.+)\n+([\s\S]*)$/i);
  return match ? { subject: match[1].trim(), body: match[2].trim() } : { subject: "", body: text };
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Request failed.");
  }
  return data as T;
}

export function ApplicationAssistant({
  applicationId,
  hasContext,
  recruiters,
  followUps,
  onFollowUpsChanged,
  onApplicationChanged,
}: ApplicationAssistantProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [mode, setMode] = useState<DraftKind>("follow_up_email");
  const [question, setQuestion] = useState<string>(QUICK_QUESTIONS[0]);
  const [instructions, setInstructions] = useState("");
  const [targetFollowUpId, setTargetFollowUpId] = useState("");
  const [recruiterId, setRecruiterId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [attachTargets, setAttachTargets] = useState<Record<string, string>>({});
  const [busyDraftId, setBusyDraftId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const plannedFollowUps = followUps.filter((followUp) => followUp.status === "planned");

  async function loadDrafts() {
    try {
      const data = await requestJson<{ items: Draft[] }>(
        `/api/applications/${applicationId}/drafts`
      );
      setDrafts(data.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load drafts.");
    }
  }

  useEffect(() => {
    void loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  function replaceDraft(draft: Draft) {
    setDrafts((current) => current.map((item) => (item.id === draft.id ? draft : item)));
    setEdits((current) => {
      const next = { ...current };
      delete next[draft.id];
      return next;
    });
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    setNotice(null);

    const body =
      mode === "qa_answer"
        ? { kind: mode, question }
        : {
            kind: mode,
            followUpId: targetFollowUpId || undefined,
            recruiterId: recruiterId || undefined,
            instructions,
          };

    try {
      const data = await requestJson<{ item: Draft }>(
        `/api/applications/${applicationId}/drafts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      setDrafts((current) => [data.item, ...current]);
    } catch (generateError) {
      setError(
        generateError instanceof Error ? generateError.message : "Could not generate a draft."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function review(draft: Draft, action: "edit" | "approve" | "reject") {
    setBusyDraftId(draft.id);
    setError(null);
    setNotice(null);

    try {
      const data = await requestJson<{ item: Draft }>(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "edit" ? { action, content: edits[draft.id] } : { action }
        ),
      });
      replaceDraft(data.item);
      // An edited or rejected draft blocks any follow-up it is attached to.
      onFollowUpsChanged();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not update draft.");
    } finally {
      setBusyDraftId(null);
    }
  }

  async function deleteDraft(draft: Draft) {
    if (!confirm("Delete this draft?")) return;
    setBusyDraftId(draft.id);

    try {
      await requestJson(`/api/drafts/${draft.id}`, { method: "DELETE" });
      setDrafts((current) => current.filter((item) => item.id !== draft.id));
      onFollowUpsChanged();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete draft.");
    } finally {
      setBusyDraftId(null);
    }
  }

  // Every use goes through the apply endpoint, which refuses unapproved drafts.
  async function applyDraft(
    draft: Draft,
    target: "follow_up" | "notes" | "export",
    followUpId?: string
  ) {
    setBusyDraftId(draft.id);
    setError(null);
    setNotice(null);

    try {
      const data = await requestJson<{ item: Draft; text: string }>(
        `/api/drafts/${draft.id}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target, followUpId }),
        }
      );
      replaceDraft(data.item);
      return data.text;
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Could not use draft.");
      return null;
    } finally {
      setBusyDraftId(null);
    }
  }

  async function copyDraft(draft: Draft) {
    const text = await applyDraft(draft, "export");
    if (text === null) return;
    await navigator.clipboard.writeText(text);
    setNotice("Copied to clipboard.");
  }

  async function emailDraft(draft: Draft) {
    const text = await applyDraft(draft, "export");
    if (text === null) return;
    const { subject, body } = splitSubject(text);
    const to = recruiters.find((recruiter) => recruiter.id === draft.recruiterId)?.email ?? "";
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  }

  async function attachDraft(draft: Draft) {
    const followUpId = attachTargets[draft.id] ?? plannedFollowUps[0]?.id;
    if (!followUpId) return;
    const text = await applyDraft(draft, "follow_up", followUpId);
    if (text === null) return;
    onFollowUpsChanged();
    setNotice("Draft attached to the follow-up.");
  }

  async function appendToNotes(draft: Draft) {
    const text = await applyDraft(draft, "notes");
    if (text === null) return;
    onApplicationChanged();
    setNotice("Answer appended to the application notes.");
  }

  return (
    <div className="space-y-4">
      <div className="panel-card space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            className={mode === "follow_up_email" ? "app-button" : "app-button-secondary"}
            onClick={() => setMode("follow_up_email")}
          >
            Draft a follow-up
          </button>
          <button
            className={mode === "qa_answer" ? "app-button" : "app-button-secondary"}
            onClick={() => setMode("qa_answer")}
          >
            Ask about this application
          </button>
        </div>

        {mode === "follow_up_email" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="draft-follow-up">
                For follow-up
              </label>
              <select
                id="draft-follow-up"
                className="field-select"
                value={targetFollowUpId}
                onChange={(e) => setTargetFollowUpId(e.target.value)}
              >
                <option value="">Not tied to a follow-up (email)</option>
                {plannedFollowUps.map((followUp) => (
                  <option key={followUp.id} value={followUp.id}>
                    {followUp.dueDate} via {followUp.channel}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="draft-recruiter">
                Recipient
              </label>
              <select
                id="draft-recruiter"
                className="field-select"
                value={recruiterId}
                onChange={(e) => setRecruiterId(e.target.value)}
              >
                <option value="">
                  {targetFollowUpId ? "Use the follow-up's recruiter" : "Hiring team"}
                </option>
                {recruiters.map((recruiter, index) => (
                  <option key={recruiter.id} value={recruiter.id}>
                    {recruiterLabel(recruiter, index)}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="field-label" htmlFor="draft-instructions">
                Anything to mention (optional)
              </label>
              <textarea
                id="draft-instructions"
                className="field-textarea"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. mention my distributed systems project, keep it brief"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((prompt) => (
                <button
                  key={prompt}
                  className="app-button-secondary"
                  onClick={() => setQuestion(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div>
              <label className="field-label" htmlFor="draft-question">
                Question
              </label>
              <textarea
                id="draft-question"
                className="field-textarea"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What should I emphasize for this role?"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="section-subtitle">
            {hasContext
              ? "Output goes to the review queue below. Nothing is used until you approve it."
              : "Sync context first so the assistant has sources to ground its output."}
          </div>
          <button
            className="app-button"
            onClick={generate}
            disabled={generating || !hasContext}
          >
            {generating ? "Generating..." : "Generate draft"}
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="badge badge-offer">{notice}</div> : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="section-title">Review queue</div>
          <div className="badge badge-neutral">
            {drafts.filter((draft) => draft.status === "pending_review").length} awaiting review
          </div>
        </div>

        {drafts.length === 0 ? (
          <div className="empty-state">No drafts yet.</div>
        ) : (
          drafts.map((draft) => {
            const badge = STATUS_BADGES[draft.status];
            const editValue = edits[draft.id] ?? draft.finalText;
            const isEdited = edits[draft.id] !== undefined && edits[draft.id] !== draft.finalText;
            const isBusy = busyDraftId === draft.id;
            const isApproved = draft.status === "approved";

            return (
              <div key={draft.id} className="result-card-compact space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-semibold">
                      {draft.kind === "follow_up_email" ? "Follow-up draft" : "Answer"}
                    </div>
                    <div className="section-subtitle">
                      {new Date(draft.createdAt).toLocaleString()} | {draft.provider} ·{" "}
                      {draft.model}
                      {draft.editedContent ? " | edited" : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={badge.className}>{badge.label}</span>
                    {draft.appliedAt ? <span className="badge badge-neutral">Used</span> : null}
                  </div>
                </div>

                {draft.kind === "qa_answer" ? (
                  <div className="section-subtitle">Q: {draft.prompt}</div>
                ) : (
                  <details>
                    <summary className="section-subtitle cursor-pointer">
                      What the model was given
                    </summary>
                    <div className="result-snippet whitespace-pre-wrap">{draft.prompt}</div>
                  </details>
                )}

                <textarea
                  className="field-textarea min-h-[180px]"
                  value={editValue}
                  onChange={(e) =>
                    setEdits((current) => ({ ...current, [draft.id]: e.target.value }))
                  }
                  disabled={draft.status === "rejected"}
                />

                <div className="flex flex-wrap items-center gap-2">
                  {isEdited ? (
                    <button
                      className="app-button-secondary"
                      onClick={() => review(draft, "edit")}
                      disabled={isBusy}
                    >
                      Save edit
                    </button>
                  ) : null}
                  {draft.status === "pending_review" ? (
                    <button
                      className="app-button"
                      onClick={() => review(draft, "approve")}
                      disabled={isBusy || isEdited}
                      title={isEdited ? "Save your edit before approving" : undefined}
                    >
                      Approve
                    </button>
                  ) : null}
                  {draft.status !== "rejected" ? (
                    <button
                      className="app-button-secondary"
                      onClick={() => review(draft, "reject")}
                      disabled={isBusy}
                    >
                      Reject
                    </button>
                  ) : null}
                  <button
                    className="app-button-ghost"
                    onClick={() => deleteDraft(draft)}
                    disabled={isBusy}
                  >
                    Delete
                  </button>
                </div>

                {isApproved ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="app-button-secondary"
                      onClick={() => copyDraft(draft)}
                      disabled={isBusy}
                    >
                      Copy
                    </button>
                    {draft.kind === "follow_up_email" ? (
                      <>
                        <button
                          className="app-button-secondary"
                          onClick={() => emailDraft(draft)}
                          disabled={isBusy}
                        >
                          Open in email
                        </button>
                        {plannedFollowUps.length > 0 ? (
                          <>
                            <select
                              className="field-select w-auto"
                              value={attachTargets[draft.id] ?? plannedFollowUps[0].id}
                              onChange={(e) =>
                                setAttachTargets((current) => ({
                                  ...current,
                                  [draft.id]: e.target.value,
                                }))
                              }
                            >
                              {plannedFollowUps.map((followUp) => (
                                <option key={followUp.id} value={followUp.id}>
                                  {followUp.dueDate} via {followUp.channel}
                                </option>
                              ))}
                            </select>
                            <button
                              className="app-button-secondary"
                              onClick={() => attachDraft(draft)}
                              disabled={isBusy}
                            >
                              Attach to follow-up
                            </button>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <button
                        className="app-button-secondary"
                        onClick={() => appendToNotes(draft)}
                        disabled={isBusy}
                      >
                        Append to notes
                      </button>
                    )}
                  </div>
                ) : draft.status === "pending_review" ? (
                  <div className="section-subtitle">
                    Approve this draft to copy, email, attach, or save it.
                  </div>
                ) : null}

                {draft.citations.length > 0 ? (
                  <details>
                    <summary className="section-subtitle cursor-pointer">
                      {draft.citations.length} retrieved sources
                    </summary>
                    <div className="scroll-panel mt-2 space-y-2">
                      {draft.citations.map((citation, index) => (
                        <div key={citation.id} className="list-card space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold">
                              [{index + 1}] {citation.title}
                            </div>
                            <span className="badge badge-neutral">score {citation.score}</span>
                          </div>
                          <div className="section-subtitle">
                            {formatSourceType(citation.sourceType)}
                          </div>
                          <div className="result-snippet">{citation.content}</div>
                          {citation.url ? (
                            <a
                              className="subtle-link"
                              href={citation.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open source
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
