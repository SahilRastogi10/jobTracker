"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

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
  language: string;
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

const QUICK_QUESTIONS: MessageKey[] = ["assistant.quick1", "assistant.quick2", "assistant.quick3"];

const STATUS_BADGES: Record<DraftStatus, { label: MessageKey; className: string }> = {
  pending_review: { label: "assistant.statusPending", className: "badge badge-applied" },
  approved: { label: "assistant.statusApproved", className: "badge badge-offer" },
  rejected: { label: "assistant.statusRejected", className: "badge badge-rejected" },
};

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
  const { t, tValue, locale, dateLocale } = useI18n();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [mode, setMode] = useState<DraftKind>("follow_up_email");
  // A picked quick question stays a key so it follows the language toggle; typing replaces it.
  const [quickQuestion, setQuickQuestion] = useState<MessageKey | null>(QUICK_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState("");
  const question = quickQuestion ? t(quickQuestion) : customQuestion;
  const [instructions, setInstructions] = useState("");
  const [targetFollowUpId, setTargetFollowUpId] = useState("");
  const [recruiterId, setRecruiterId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [attachTargets, setAttachTargets] = useState<Record<string, string>>({});
  const [busyDraftId, setBusyDraftId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [audio, setAudio] = useState<{ draftId: string; state: "loading" | "playing" } | null>(
    null
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Audio per draft text, so replaying does not spend more ElevenLabs quota.
  const audioCache = useRef(new Map<string, string>());

  useEffect(() => {
    const cache = audioCache.current;
    return () => {
      audioRef.current?.pause();
      cache.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function recruiterLabel(recruiter: AssistantRecruiter, index: number) {
    return recruiter.name || recruiter.email || t("detail.recruiterN", { n: index + 1 });
  }

  const plannedFollowUps = followUps.filter((followUp) => followUp.status === "planned");

  async function loadDrafts() {
    try {
      const data = await requestJson<{ items: Draft[] }>(
        `/api/applications/${applicationId}/drafts`
      );
      setDrafts(data.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("assistant.errLoad"));
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
        ? { kind: mode, question, language: locale }
        : {
            kind: mode,
            language: locale,
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
        generateError instanceof Error ? generateError.message : t("assistant.errGenerate")
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
      setError(reviewError instanceof Error ? reviewError.message : t("assistant.errUpdate"));
    } finally {
      setBusyDraftId(null);
    }
  }

  async function deleteDraft(draft: Draft) {
    if (!confirm(t("assistant.confirmDelete"))) return;
    setBusyDraftId(draft.id);

    try {
      await requestJson(`/api/drafts/${draft.id}`, { method: "DELETE" });
      setDrafts((current) => current.filter((item) => item.id !== draft.id));
      onFollowUpsChanged();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("assistant.errDelete"));
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
      setError(applyError instanceof Error ? applyError.message : t("assistant.errUse"));
      return null;
    } finally {
      setBusyDraftId(null);
    }
  }

  async function copyDraft(draft: Draft) {
    const text = await applyDraft(draft, "export");
    if (text === null) return;
    await navigator.clipboard.writeText(text);
    setNotice(t("assistant.copied"));
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
    setNotice(t("assistant.attached"));
  }

  async function appendToNotes(draft: Draft) {
    const text = await applyDraft(draft, "notes");
    if (text === null) return;
    onApplicationChanged();
    setNotice(t("assistant.appended"));
  }

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    setAudio(null);
  }

  async function listen(draft: Draft) {
    if (audio?.draftId === draft.id) {
      stopAudio();
      return;
    }

    stopAudio();
    setError(null);
    setAudio({ draftId: draft.id, state: "loading" });

    try {
      const cacheKey = `${draft.id}:${draft.finalText}`;
      let url = audioCache.current.get(cacheKey);

      if (!url) {
        const res = await fetch(`/api/drafts/${draft.id}/speech`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(typeof data?.error === "string" ? data.error : t("assistant.errListen"));
        }
        url = URL.createObjectURL(await res.blob());
        audioCache.current.set(cacheKey, url);
      }

      const player = new Audio(url);
      audioRef.current = player;
      player.onended = () => setAudio(null);
      await player.play();
      setAudio({ draftId: draft.id, state: "playing" });
    } catch (listenError) {
      setAudio(null);
      setError(listenError instanceof Error ? listenError.message : t("assistant.errListen"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel-card space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            className={mode === "follow_up_email" ? "app-button" : "app-button-secondary"}
            onClick={() => setMode("follow_up_email")}
          >
            {t("assistant.draftFollowUp")}
          </button>
          <button
            className={mode === "qa_answer" ? "app-button" : "app-button-secondary"}
            onClick={() => setMode("qa_answer")}
          >
            {t("assistant.askAbout")}
          </button>
        </div>

        {mode === "follow_up_email" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="draft-follow-up">
                {t("assistant.forFollowUp")}
              </label>
              <select
                id="draft-follow-up"
                className="field-select"
                value={targetFollowUpId}
                onChange={(e) => setTargetFollowUpId(e.target.value)}
              >
                <option value="">{t("assistant.notTied")}</option>
                {plannedFollowUps.map((followUp) => (
                  <option key={followUp.id} value={followUp.id}>
                    {t("assistant.followUpOption", {
                      date: followUp.dueDate,
                      channel: tValue("channel", followUp.channel),
                    })}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="draft-recruiter">
                {t("assistant.recipient")}
              </label>
              <select
                id="draft-recruiter"
                className="field-select"
                value={recruiterId}
                onChange={(e) => setRecruiterId(e.target.value)}
              >
                <option value="">
                  {targetFollowUpId ? t("assistant.useFollowUpRecruiter") : t("assistant.hiringTeam")}
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
                {t("assistant.instructions")}
              </label>
              <textarea
                id="draft-instructions"
                className="field-textarea"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={t("assistant.instructionsPlaceholder")}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((key) => (
                <button
                  key={key}
                  className={quickQuestion === key ? "app-button" : "app-button-secondary"}
                  onClick={() => setQuickQuestion(key)}
                >
                  {t(key)}
                </button>
              ))}
            </div>
            <div>
              <label className="field-label" htmlFor="draft-question">
                {t("assistant.question")}
              </label>
              <textarea
                id="draft-question"
                className="field-textarea"
                value={question}
                onChange={(e) => {
                  setQuickQuestion(null);
                  setCustomQuestion(e.target.value);
                }}
                placeholder={t("assistant.questionPlaceholder")}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="section-subtitle">
            {hasContext ? t("assistant.hintReady") : t("assistant.hintNoContext")}{" "}
            {t("assistant.writtenIn", { language: t(locale === "es" ? "language.es" : "language.en") })}
          </div>
          <button
            className="app-button"
            onClick={generate}
            disabled={generating || !hasContext}
          >
            {generating ? t("assistant.generating") : t("assistant.generate")}
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="badge badge-offer">{notice}</div> : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="section-title">{t("assistant.reviewQueue")}</div>
          <div className="badge badge-neutral">
            {t("assistant.awaiting", {
              count: drafts.filter((draft) => draft.status === "pending_review").length,
            })}
          </div>
        </div>

        {drafts.length === 0 ? (
          <div className="empty-state">{t("assistant.noDrafts")}</div>
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
                      {draft.kind === "follow_up_email" ? t("assistant.followUpDraft") : t("assistant.answer")}
                    </div>
                    <div className="section-subtitle">
                      {new Date(draft.createdAt).toLocaleString(dateLocale)} | {draft.provider} |{" "}
                      {draft.model}
                      {draft.editedContent ? t("assistant.edited") : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge badge-neutral">{draft.language.toUpperCase()}</span>
                    <span className={badge.className}>{t(badge.label)}</span>
                    {draft.appliedAt ? (
                      <span className="badge badge-neutral">{t("assistant.used")}</span>
                    ) : null}
                  </div>
                </div>

                {draft.kind === "qa_answer" ? (
                  <div className="section-subtitle">
                    {t("assistant.questionPrefix", { prompt: draft.prompt })}
                  </div>
                ) : (
                  <details>
                    <summary className="section-subtitle cursor-pointer">
                      {t("assistant.modelGiven")}
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
                      {t("assistant.saveEdit")}
                    </button>
                  ) : null}
                  {draft.status === "pending_review" ? (
                    <button
                      className="app-button"
                      onClick={() => review(draft, "approve")}
                      disabled={isBusy || isEdited}
                      title={isEdited ? t("assistant.saveBeforeApprove") : undefined}
                    >
                      {t("assistant.approve")}
                    </button>
                  ) : null}
                  {draft.status !== "rejected" ? (
                    <button
                      className="app-button-secondary"
                      onClick={() => review(draft, "reject")}
                      disabled={isBusy}
                    >
                      {t("assistant.reject")}
                    </button>
                  ) : null}
                  <button
                    className="app-button-secondary"
                    onClick={() => listen(draft)}
                    disabled={audio?.draftId === draft.id && audio.state === "loading"}
                  >
                    {audio?.draftId === draft.id
                      ? audio.state === "loading"
                        ? t("assistant.loadingAudio")
                        : t("assistant.stop")
                      : t("assistant.listen")}
                  </button>
                  <button
                    className="app-button-ghost"
                    onClick={() => deleteDraft(draft)}
                    disabled={isBusy}
                  >
                    {t("common.delete")}
                  </button>
                </div>

                {isApproved ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="app-button-secondary"
                      onClick={() => copyDraft(draft)}
                      disabled={isBusy}
                    >
                      {t("assistant.copy")}
                    </button>
                    {draft.kind === "follow_up_email" ? (
                      <>
                        <button
                          className="app-button-secondary"
                          onClick={() => emailDraft(draft)}
                          disabled={isBusy}
                        >
                          {t("assistant.openEmail")}
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
                                  {t("assistant.followUpOption", {
                                    date: followUp.dueDate,
                                    channel: tValue("channel", followUp.channel),
                                  })}
                                </option>
                              ))}
                            </select>
                            <button
                              className="app-button-secondary"
                              onClick={() => attachDraft(draft)}
                              disabled={isBusy}
                            >
                              {t("assistant.attach")}
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
                        {t("assistant.appendNotes")}
                      </button>
                    )}
                  </div>
                ) : draft.status === "pending_review" ? (
                  <div className="section-subtitle">
                    {t("assistant.approveToUse")}
                  </div>
                ) : null}

                {draft.citations.length > 0 ? (
                  <details>
                    <summary className="section-subtitle cursor-pointer">
                      {t("assistant.sources", { count: draft.citations.length })}
                    </summary>
                    <div className="scroll-panel mt-2 space-y-2">
                      {draft.citations.map((citation, index) => (
                        <div key={citation.id} className="list-card space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold">
                              [{index + 1}] {citation.title}
                            </div>
                            <span className="badge badge-neutral">
                              {t("assistant.score", { score: citation.score })}
                            </span>
                          </div>
                          <div className="section-subtitle">
                            {tValue("sourceType", citation.sourceType)}
                          </div>
                          <div className="result-snippet">{citation.content}</div>
                          {citation.url ? (
                            <a
                              className="subtle-link"
                              href={citation.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("common.openSource")}
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
