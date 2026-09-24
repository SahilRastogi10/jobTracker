"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApplicationAssistant } from "@/components/ApplicationAssistant";
import { useI18n } from "@/components/LanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { PageFrame } from "@/components/PageFrame";

type Application = {
  id: string;
  company: string;
  role: string;
  link?: string | null;
  stage: string;
  dateApplied: string;
  notes?: string | null;
};

type Recruiter = {
  id: string;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  linkedIn?: string | null;
  source?: string | null;
};

type RecruiterPatch = Partial<Omit<Recruiter, "id">>;

type FollowUp = {
  id: string;
  dueDate: string;
  channel: string;
  status: string;
  sentAt?: string | null;
  notes?: string | null;
  recruiterId?: string | null;
  draft?: { id: string; status: string } | null;
  hasReminder: boolean;
};

type FollowUpPatch = Partial<
  Pick<FollowUp, "dueDate" | "channel" | "status" | "notes" | "recruiterId">
>;

const FOLLOW_UP_CHANNELS = ["email", "linkedin", "other"] as const;
const FOLLOW_UP_STATUSES = ["planned", "sent", "skipped"] as const;

type ContactResearchResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  favicon?: string;
};

type EmailMention = {
  email: string;
  sourceTitle: string;
  sourceUrl: string;
  context: string;
  relevance: number;
};

type ContactResearchResponse = {
  provider: string;
  queries: {
    recruiterEmails: string;
    recruiterProfiles: string;
    companyPages: string;
  };
  recruiterEmails: EmailMention[];
  otherEmails: EmailMention[];
  profiles: ContactResearchResult[];
  companyPages: ContactResearchResult[];
};

type ContextDocumentSummary = {
  id: string;
  sourceType: string;
  title: string;
  url?: string | null;
  updatedAt: string;
  chunkCount: number;
};

type ContextStatus = {
  documentCount: number;
  chunkCount: number;
  lastSyncedAt?: string | null;
  documents: ContextDocumentSummary[];
};

type ContextStatusResponse = {
  status: ContextStatus;
  warnings?: string[];
};

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function stageBadgeClass(stage: string) {
  switch (stage) {
    case "interview":
      return "badge badge-interview";
    case "offer":
      return "badge badge-offer";
    case "rejected":
      return "badge badge-rejected";
    case "applied":
    default:
      return "badge badge-applied";
  }
}

function makeSearchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function getHostname(url: string | null | undefined) {
  if (!url) return null;

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function formatSourceLabel(url: string | undefined, fallback: string) {
  const host = getHostname(url);
  return host ?? fallback;
}

function emailRelevanceKey(score: number): MessageKey {
  if (score >= 10) return "detail.relevanceStrong";
  if (score >= 6) return "detail.relevanceRecruiting";
  if (score >= 3) return "detail.relevancePossible";
  return "detail.relevanceCompany";
}

export default function ApplicationDetailPage() {
  const { t, tValue, dateLocale } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [item, setItem] = useState<Application | null>(null);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [saveTarget, setSaveTarget] = useState<string>("new");
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [followUpBusyId, setFollowUpBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchResults, setResearchResults] =
    useState<ContactResearchResponse | null>(null);
  const [contextStatus, setContextStatus] = useState<ContextStatus | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextSyncing, setContextSyncing] = useState(false);
  const [contextWarnings, setContextWarnings] = useState<string[]>([]);
  const [contextError, setContextError] = useState<string | null>(null);

  async function load(appId: string) {
    const res = await fetch(`/api/applications/${appId}`);
    if (!res.ok) {
      setItem(null);
      return;
    }
    const data = await res.json();
    setItem(data.item ?? null);
  }

  async function loadRecruiters(appId: string) {
    const res = await fetch(`/api/applications/${appId}/recruiters`);
    if (!res.ok) return;
    const data = await res.json();
    setRecruiters(Array.isArray(data.items) ? data.items : []);
  }

  async function loadFollowUps(appId: string) {
    const res = await fetch(`/api/applications/${appId}/followups`);
    if (!res.ok) return;
    const data = await res.json();
    setFollowUps(Array.isArray(data.items) ? data.items : []);
  }

  async function loadContextStatus(appId: string) {
    setContextLoading(true);
    setContextError(null);

    try {
      const res = await fetch(`/api/applications/${appId}/context`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : t("detail.errLoadContext")
        );
      }

      setContextStatus(data.status ?? null);
      setContextWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    } catch (error) {
      setContextError(
        error instanceof Error
          ? error.message
          : t("detail.errLoadContext")
      );
    } finally {
      setContextLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    void load(id);
    void loadRecruiters(id);
    void loadFollowUps(id);
    void loadContextStatus(id);
    // Reload only when the application changes, not when the language does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save(patch: Partial<Application>) {
    if (!item) return;
    setSaving(true);
    const res = await fetch(`/api/applications/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      setItem(data.item);
    }
  }

  async function remove() {
    if (!item) return;
    if (!confirm(t("detail.confirmDeleteApplication"))) return;
    await fetch(`/api/applications/${item.id}`, { method: "DELETE" });
    router.push("/applications");
  }

  async function addFollowUp() {
    if (!item) return;
    const lastDueDate = followUps.at(-1)?.dueDate;
    const dueDate = addDays(lastDueDate ?? item.dateApplied, 7);

    const res = await fetch(`/api/applications/${item.id}/followups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setFollowUps((current) =>
      [...current, data.item as FollowUp].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    );
  }

  function editFollowUpLocal(followUpId: string, patch: FollowUpPatch) {
    setFollowUps((current) =>
      current.map((followUp) =>
        followUp.id === followUpId ? { ...followUp, ...patch } : followUp
      )
    );
  }

  async function saveFollowUp(followUpId: string, patch: FollowUpPatch) {
    setSaving(true);
    const res = await fetch(`/api/followups/${followUpId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    const data = await res.json();
    if (!res.ok) {
      alert(typeof data?.error === "string" ? data.error : t("detail.errSaveFollowUp"));
      if (item) void loadFollowUps(item.id);
      return;
    }
    editFollowUpLocal(followUpId, data.item);
  }

  async function deleteFollowUp(followUpId: string) {
    if (!confirm(t("detail.confirmDeleteFollowUp"))) return;
    const res = await fetch(`/api/followups/${followUpId}`, { method: "DELETE" });
    if (!res.ok) return;
    setFollowUps((current) => current.filter((followUp) => followUp.id !== followUpId));
  }

  async function detachDraft(followUpId: string) {
    const res = await fetch(`/api/followups/${followUpId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId: null }),
    });
    if (res.ok) {
      const data = await res.json();
      editFollowUpLocal(followUpId, data.item);
    }
  }

  async function createFollowUpReminder(followUp: FollowUp) {
    if (!item) return;
    setFollowUpBusyId(followUp.id);

    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: followUp.dueDate,
        time: "09:00",
        message: t("today.followUpReminder", { company: item.company, role: item.role }),
        followUpId: followUp.id,
      }),
    });

    setFollowUpBusyId(null);
    if (res.ok) editFollowUpLocal(followUp.id, { hasReminder: true } as FollowUpPatch);
  }

  async function runContactResearch() {
    if (!item) return;

    setResearchLoading(true);
    setResearchError(null);

    try {
      const res = await fetch("/api/contact-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: item.company,
          role: item.role,
          link: item.link ?? "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : t("detail.searchFailed")
        );
      }

      setResearchResults(data);
    } catch (error) {
      setResearchError(
        error instanceof Error ? error.message : t("detail.errResearch")
      );
    } finally {
      setResearchLoading(false);
    }
  }

  async function createRecruiter(patch: RecruiterPatch = {}) {
    if (!item) return null;
    const res = await fetch(`/api/applications/${item.id}/recruiters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const created = data.item as Recruiter;
    setRecruiters((current) => [...current, created]);
    return created;
  }

  function editRecruiterLocal(recruiterId: string, patch: RecruiterPatch) {
    setRecruiters((current) =>
      current.map((recruiter) =>
        recruiter.id === recruiterId ? { ...recruiter, ...patch } : recruiter
      )
    );
  }

  async function saveRecruiter(recruiterId: string, patch: RecruiterPatch) {
    setSaving(true);
    const res = await fetch(`/api/recruiters/${recruiterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      editRecruiterLocal(recruiterId, data.item);
    }
  }

  async function deleteRecruiter(recruiterId: string) {
    if (!confirm(t("detail.confirmDeleteRecruiter"))) return;
    const res = await fetch(`/api/recruiters/${recruiterId}`, { method: "DELETE" });
    if (!res.ok) return;
    setRecruiters((current) => current.filter((recruiter) => recruiter.id !== recruiterId));
    setFollowUps((current) =>
      current.map((followUp) =>
        followUp.recruiterId === recruiterId ? { ...followUp, recruiterId: null } : followUp
      )
    );
    if (saveTarget === recruiterId) setSaveTarget("new");
  }

  // Research results go to the selected recruiter; "new" creates one and targets it for later saves.
  async function applyContactFields(patch: RecruiterPatch) {
    if (saveTarget === "new" || !recruiters.some((r) => r.id === saveTarget)) {
      const created = await createRecruiter(patch);
      if (created) setSaveTarget(created.id);
      return;
    }

    editRecruiterLocal(saveTarget, patch);
    await saveRecruiter(saveTarget, patch);
  }

  async function syncApplicationContext() {
    if (!item) return;

    setContextSyncing(true);
    setContextError(null);

    try {
      const res = await fetch(`/api/applications/${item.id}/context`, {
        method: "POST",
      });
      const data = (await res.json()) as ContextStatusResponse & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : t("detail.errSyncContext")
        );
      }

      setContextStatus(data.status ?? null);
      setContextWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    } catch (error) {
      setContextError(
        error instanceof Error
          ? error.message
          : t("detail.errSyncContext")
      );
    } finally {
      setContextSyncing(false);
    }
  }

  if (!id) {
    return (
      <PageFrame
        title={t("detail.loadingTitle")}
        subtitle={t("detail.loadingSubtitle")}
      >
        <section className="panel-card">
          <div className="empty-state">{t("common.loading")}</div>
        </section>
      </PageFrame>
    );
  }

  if (!item) {
    return (
      <PageFrame
        title={t("detail.notFoundTitle")}
        subtitle={t("detail.notFoundSubtitle")}
        actions={
          <Link href="/applications" className="app-button-secondary">
            {t("detail.backToApplications")}
          </Link>
        }
      >
        <section className="panel-card">
          <div className="empty-state">{t("common.loading")}</div>
        </section>
      </PageFrame>
    );
  }

  const host = getHostname(item.link);
  const peopleSearchUrl = makeSearchUrl(
    `${item.company} recruiter ${item.role} LinkedIn`
  );
  const talentSearchUrl = makeSearchUrl(
    `${item.company} talent acquisition ${item.role}`
  );
  const linkedinSearchUrl = makeSearchUrl(
    `site:linkedin.com/in ${item.company} recruiter`
  );
  const careersSearchUrl = makeSearchUrl(
    `${item.company} careers team contact`
  );
  const companySiteSearchUrl = host
    ? makeSearchUrl(`site:${host} recruiting OR careers OR talent`)
    : null;

  return (
    <PageFrame
      eyebrow={item.role}
      title={item.company}
      subtitle={t("detail.subtitle", { date: item.dateApplied })}
      actions={
        <>
          <span className={stageBadgeClass(item.stage)}>{tValue("stage", item.stage)}</span>
          <Link href="/applications" className="app-button-secondary">
            {t("common.back")}
          </Link>
        </>
      }
    >
      <section className="panel-card space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="company">
              {t("common.company")}
            </label>
            <input
              id="company"
              className="field-input"
              value={item.company}
              onChange={(e) => setItem({ ...item, company: e.target.value })}
              onBlur={() => save({ company: item.company })}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="role">
              {t("common.role")}
            </label>
            <input
              id="role"
              className="field-input"
              value={item.role}
              onChange={(e) => setItem({ ...item, role: e.target.value })}
              onBlur={() => save({ role: item.role })}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="link">
              {t("detail.jobLink")}
            </label>
            <input
              id="link"
              className="field-input"
              value={item.link ?? ""}
              onChange={(e) => setItem({ ...item, link: e.target.value })}
              onBlur={() => save({ link: item.link ?? "" })}
              placeholder="https://..."
            />
            {item.link ? (
              <Link
                className="subtle-link mt-2 inline-block text-sm"
                href={`/match?url=${encodeURIComponent(item.link)}`}
              >
                {t("detail.checkMatch")}
              </Link>
            ) : null}
          </div>

          <div>
            <label className="field-label" htmlFor="stage">
              {t("common.stage")}
            </label>
            <select
              id="stage"
              className="field-select"
              value={item.stage}
              onChange={(e) => {
                const value = e.target.value;
                setItem({ ...item, stage: value });
                void save({ stage: value });
              }}
            >
              {["applied", "interview", "rejected", "offer"].map((value) => (
                <option key={value} value={value}>
                  {tValue("stage", value)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="date-applied">
              {t("detail.appliedDate")}
            </label>
            <input
              id="date-applied"
              className="field-input"
              type="date"
              value={item.dateApplied}
              onChange={(e) => setItem({ ...item, dateApplied: e.target.value })}
              onBlur={() => save({ dateApplied: item.dateApplied })}
            />
          </div>

        </div>

        <div className="list-card space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="section-title">{t("detail.followUps")}</div>
              <p className="section-subtitle">
                {t("detail.followUpsHelp")}
              </p>
            </div>
            <button className="app-button" onClick={addFollowUp}>
              {t("detail.addFollowUp")}
            </button>
          </div>

          {followUps.length === 0 ? (
            <div className="empty-state">{t("detail.noFollowUps")}</div>
          ) : (
            followUps.map((followUp) => (
              <div key={followUp.id} className="panel-card space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="field-label" htmlFor={`follow-up-date-${followUp.id}`}>
                      {t("detail.dueDate")}
                    </label>
                    <input
                      id={`follow-up-date-${followUp.id}`}
                      className="field-input"
                      type="date"
                      value={followUp.dueDate}
                      onChange={(e) => editFollowUpLocal(followUp.id, { dueDate: e.target.value })}
                      onBlur={() => saveFollowUp(followUp.id, { dueDate: followUp.dueDate })}
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor={`follow-up-channel-${followUp.id}`}>
                      {t("detail.channel")}
                    </label>
                    <select
                      id={`follow-up-channel-${followUp.id}`}
                      className="field-select"
                      value={followUp.channel}
                      onChange={(e) => {
                        editFollowUpLocal(followUp.id, { channel: e.target.value });
                        void saveFollowUp(followUp.id, { channel: e.target.value });
                      }}
                    >
                      {FOLLOW_UP_CHANNELS.map((channel) => (
                        <option key={channel} value={channel}>
                          {tValue("channel", channel)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="field-label" htmlFor={`follow-up-recruiter-${followUp.id}`}>
                      {t("detail.recruiter")}
                    </label>
                    <select
                      id={`follow-up-recruiter-${followUp.id}`}
                      className="field-select"
                      value={followUp.recruiterId ?? ""}
                      onChange={(e) => {
                        const recruiterId = e.target.value || null;
                        editFollowUpLocal(followUp.id, { recruiterId });
                        void saveFollowUp(followUp.id, { recruiterId });
                      }}
                    >
                      <option value="">{t("detail.noRecruiter")}</option>
                      {recruiters.map((recruiter, index) => (
                        <option key={recruiter.id} value={recruiter.id}>
                          {recruiter.name || recruiter.email || t("detail.recruiterN", { n: index + 1 })}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="field-label" htmlFor={`follow-up-status-${followUp.id}`}>
                      {t("detail.status")}
                    </label>
                    <select
                      id={`follow-up-status-${followUp.id}`}
                      className="field-select"
                      value={followUp.status}
                      onChange={(e) => {
                        editFollowUpLocal(followUp.id, { status: e.target.value });
                        void saveFollowUp(followUp.id, { status: e.target.value });
                      }}
                    >
                      {FOLLOW_UP_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {tValue("followUpStatus", status)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="field-label" htmlFor={`follow-up-notes-${followUp.id}`}>
                    {t("common.notes")}
                  </label>
                  <textarea
                    id={`follow-up-notes-${followUp.id}`}
                    className="field-textarea"
                    value={followUp.notes ?? ""}
                    onChange={(e) => editFollowUpLocal(followUp.id, { notes: e.target.value })}
                    onBlur={() => saveFollowUp(followUp.id, { notes: followUp.notes ?? "" })}
                    placeholder={t("detail.followUpNotesPlaceholder")}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {followUp.draft ? (
                      <>
                        <span
                          className={
                            followUp.draft.status === "approved"
                              ? "badge badge-offer"
                              : "badge badge-applied"
                          }
                        >
                          {followUp.draft.status === "approved"
                            ? t("detail.approvedDraftAttached")
                            : t("detail.draftNeedsReview")}
                        </span>
                        <button
                          className="app-button-ghost"
                          onClick={() => void detachDraft(followUp.id)}
                        >
                          {t("detail.detachDraft")}
                        </button>
                      </>
                    ) : null}
                    {followUp.status === "sent" && followUp.sentAt ? (
                      <span className="badge badge-offer">
                        {t("detail.sentOn", {
                          date: new Date(followUp.sentAt).toLocaleDateString(dateLocale),
                        })}
                      </span>
                    ) : null}
                    {followUp.hasReminder ? (
                      <span className="badge badge-neutral">{t("detail.reminderSet")}</span>
                    ) : (
                      <button
                        className="app-button-secondary"
                        onClick={() => createFollowUpReminder(followUp)}
                        disabled={followUpBusyId === followUp.id}
                      >
                        {followUpBusyId === followUp.id ? t("common.creating") : t("detail.createReminder")}
                      </button>
                    )}
                  </div>
                  <button
                    className="app-button-ghost"
                    onClick={() => void deleteFollowUp(followUp.id)}
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="list-card space-y-4">
          <div className="space-y-2">
            <div className="section-title">{t("detail.contactResearch")}</div>
            <p className="section-subtitle">
              {t("detail.contactResearchHelp")}
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex flex-wrap gap-2">
              <button
                className="app-button"
                onClick={runContactResearch}
                disabled={researchLoading}
              >
                {researchLoading ? t("common.searching") : t("detail.findEmails")}
              </button>
              {researchResults ? (
                <div className="badge badge-neutral">{researchResults.provider}</div>
              ) : null}
            </div>

            {researchResults ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="mini-stat">
                  <div className="mini-stat-label">{t("detail.recruiterEmails")}</div>
                  <div className="mini-stat-value">
                    {researchResults.recruiterEmails.length}
                  </div>
                </div>
                <div className="mini-stat">
                  <div className="mini-stat-label">{t("detail.otherEmails")}</div>
                  <div className="mini-stat-value">
                    {researchResults.otherEmails.length}
                  </div>
                </div>
                <div className="mini-stat">
                  <div className="mini-stat-label">{t("detail.profiles")}</div>
                  <div className="mini-stat-value">
                    {researchResults.profiles.length}
                  </div>
                </div>
                <div className="mini-stat">
                  <div className="mini-stat-label">{t("detail.pages")}</div>
                  <div className="mini-stat-value">
                    {researchResults.companyPages.length}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {researchError ? <div className="error-banner">{researchError}</div> : null}

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <a className="app-button-secondary" href={peopleSearchUrl} target="_blank" rel="noreferrer">
              {t("detail.searchRecruiterRole")}
            </a>
            <a className="app-button-secondary" href={talentSearchUrl} target="_blank" rel="noreferrer">
              {t("detail.searchTalent")}
            </a>
            <a className="app-button-secondary" href={linkedinSearchUrl} target="_blank" rel="noreferrer">
              {t("detail.searchLinkedIn")}
            </a>
            <a className="app-button-secondary" href={careersSearchUrl} target="_blank" rel="noreferrer">
              {t("detail.searchCareers")}
            </a>
            {companySiteSearchUrl ? (
              <a
                className="app-button-secondary"
                href={companySiteSearchUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t("detail.searchCompanySite")}
              </a>
            ) : null}
            {host ? (
              <a
                className="app-button-ghost"
                href={`https://${host}`}
                target="_blank"
                rel="noreferrer"
              >
                {t("detail.openHost", { host })}
              </a>
            ) : null}
          </div>

          <div className="list-card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="section-title">{t("detail.saveResearchTo")}</div>
                <p className="section-subtitle">
                  {t("detail.saveResearchHelp")}
                </p>
              </div>
              <div className="badge badge-neutral">
                {recruiters.length === 1
                  ? t("detail.recruiterCountOne")
                  : t("detail.recruiterCountMany", { count: recruiters.length })}
              </div>
            </div>

            <select
              className="field-select"
              value={saveTarget}
              onChange={(e) => setSaveTarget(e.target.value)}
            >
              <option value="new">{t("detail.newRecruiter")}</option>
              {recruiters.map((recruiter, index) => (
                <option key={recruiter.id} value={recruiter.id}>
                  {recruiter.name || recruiter.email || t("detail.recruiterN", { n: index + 1 })}
                </option>
              ))}
            </select>
          </div>

          {researchResults ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="space-y-4">
                <div className="panel-card space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="section-title">{t("detail.emailCandidates")}</div>
                      <p className="section-subtitle">
                        {t("detail.emailCandidatesHelp")}
                      </p>
                    </div>
                    <div className="badge badge-neutral">
                      {t("detail.matches", { count: researchResults.recruiterEmails.length })}
                    </div>
                  </div>

                  {researchResults.recruiterEmails.length === 0 ? (
                    <div className="empty-state">
                      {t("detail.noRecruiterEmails")}
                    </div>
                  ) : (
                    <div className="scroll-panel space-y-3">
                      {researchResults.recruiterEmails.map((mention) => (
                        <div
                          key={`${mention.email}:${mention.sourceUrl}`}
                          className="result-card-compact"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold">{mention.email}</div>
                              <div className="mt-1">
                                <span className="badge badge-neutral">
                                  {t(emailRelevanceKey(mention.relevance))}
                                </span>
                              </div>
                            </div>
                            <button
                              className="app-button"
                              onClick={() =>
                                applyContactFields({
                                  email: mention.email,
                                  source: mention.sourceUrl,
                                })
                              }
                            >
                              {t("detail.saveEmail")}
                            </button>
                          </div>

                          <div className="result-snippet">{mention.context}</div>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <a
                              className="subtle-link"
                              href={mention.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {mention.sourceTitle}
                            </a>
                            <div className="section-subtitle">
                              {formatSourceLabel(mention.sourceUrl, t("detail.publicSource"))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="panel-card space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="section-title">{t("detail.otherCompanyEmails")}</div>
                      <p className="section-subtitle">
                        {t("detail.otherEmailsHelp")}
                      </p>
                    </div>
                    <div className="badge badge-neutral">
                      {t("detail.matches", { count: researchResults.otherEmails.length })}
                    </div>
                  </div>

                  {researchResults.otherEmails.length === 0 ? (
                    <div className="empty-state">
                      {t("detail.noOtherEmails")}
                    </div>
                  ) : (
                    <div className="scroll-panel space-y-3">
                      {researchResults.otherEmails.map((mention) => (
                        <div
                          key={`${mention.email}:${mention.sourceUrl}`}
                          className="result-card-compact"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold">{mention.email}</div>
                              <div className="mt-1">
                                <span className="badge badge-neutral">
                                  {t(emailRelevanceKey(mention.relevance))}
                                </span>
                              </div>
                            </div>
                            <button
                              className="app-button-secondary"
                              onClick={() =>
                                applyContactFields({
                                  email: mention.email,
                                  source: mention.sourceUrl,
                                })
                              }
                            >
                              {t("detail.saveFallback")}
                            </button>
                          </div>

                          <div className="result-snippet">{mention.context}</div>

                          <a
                            className="subtle-link"
                            href={mention.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {mention.sourceTitle}
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="panel-card space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="section-title">{t("detail.profiles")}</div>
                      <p className="section-subtitle">
                        {t("detail.profilesHelp")}
                      </p>
                    </div>
                    <div className="badge badge-neutral">
                      {t("detail.profilesCount", { count: researchResults.profiles.length })}
                    </div>
                  </div>

                  {researchResults.profiles.length === 0 ? (
                    <div className="empty-state">{t("detail.noProfiles")}</div>
                  ) : (
                    <div className="scroll-panel space-y-3">
                      {researchResults.profiles.map((result) => (
                        <div key={result.url} className="result-card-compact">
                          <div className="font-semibold">{result.title}</div>
                          {result.content ? (
                            <div className="result-snippet">{result.content}</div>
                          ) : null}
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <a
                              className="subtle-link"
                              href={result.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("common.openSource")}
                            </a>
                            <button
                              className="app-button-secondary"
                              onClick={() =>
                                applyContactFields({
                                  linkedIn: result.url ?? "",
                                  source: result.url ?? "",
                                })
                              }
                            >
                              {t("detail.saveProfile")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="panel-card space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="section-title">{t("detail.companyPages")}</div>
                      <p className="section-subtitle">
                        {t("detail.companyPagesHelp")}
                      </p>
                    </div>
                    <div className="badge badge-neutral">
                      {t("detail.pagesCount", { count: researchResults.companyPages.length })}
                    </div>
                  </div>

                  {researchResults.companyPages.length === 0 ? (
                    <div className="empty-state">{t("detail.noPages")}</div>
                  ) : (
                    <div className="scroll-panel space-y-3">
                      {researchResults.companyPages.map((result) => (
                        <div key={result.url} className="result-card-compact">
                          <div className="font-semibold">{result.title}</div>
                          {result.content ? (
                            <div className="result-snippet">{result.content}</div>
                          ) : null}
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <a
                              className="subtle-link"
                              href={result.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("common.openSource")}
                            </a>
                            <button
                              className="app-button-secondary"
                              onClick={() =>
                                applyContactFields({
                                  source: result.url ?? "",
                                })
                              }
                            >
                              {t("detail.saveSource")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="section-title">{t("detail.recruiters")}</div>
                <p className="section-subtitle">
                  {t("detail.recruitersHelp")}
                </p>
              </div>
              <button className="app-button-secondary" onClick={() => void createRecruiter()}>
                {t("detail.addRecruiter")}
              </button>
            </div>

            {recruiters.length === 0 ? (
              <div className="empty-state">
                {t("detail.noRecruiters")}
              </div>
            ) : (
              recruiters.map((recruiter, index) => (
                <div key={recruiter.id} className="panel-card space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="section-title">
                      {recruiter.name || recruiter.email || t("detail.recruiterN", { n: index + 1 })}
                    </div>
                    <button
                      className="app-button-ghost"
                      onClick={() => void deleteRecruiter(recruiter.id)}
                    >
                      {t("common.delete")}
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="field-label" htmlFor={`recruiter-name-${recruiter.id}`}>
                        {t("detail.name")}
                      </label>
                      <input
                        id={`recruiter-name-${recruiter.id}`}
                        className="field-input"
                        value={recruiter.name ?? ""}
                        onChange={(e) => editRecruiterLocal(recruiter.id, { name: e.target.value })}
                        onBlur={() => saveRecruiter(recruiter.id, { name: recruiter.name ?? "" })}
                        placeholder="Jordan Lee"
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor={`recruiter-title-${recruiter.id}`}>
                        {t("detail.title")}
                      </label>
                      <input
                        id={`recruiter-title-${recruiter.id}`}
                        className="field-input"
                        value={recruiter.title ?? ""}
                        onChange={(e) => editRecruiterLocal(recruiter.id, { title: e.target.value })}
                        onBlur={() => saveRecruiter(recruiter.id, { title: recruiter.title ?? "" })}
                        placeholder={t("detail.titlePlaceholder")}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor={`recruiter-email-${recruiter.id}`}>
                        {t("detail.email")}
                      </label>
                      <input
                        id={`recruiter-email-${recruiter.id}`}
                        className="field-input"
                        type="email"
                        value={recruiter.email ?? ""}
                        onChange={(e) => editRecruiterLocal(recruiter.id, { email: e.target.value })}
                        onBlur={() => saveRecruiter(recruiter.id, { email: recruiter.email ?? "" })}
                        placeholder="name@company.com"
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor={`recruiter-linkedin-${recruiter.id}`}>
                        {t("detail.linkedIn")}
                      </label>
                      <input
                        id={`recruiter-linkedin-${recruiter.id}`}
                        className="field-input"
                        value={recruiter.linkedIn ?? ""}
                        onChange={(e) => editRecruiterLocal(recruiter.id, { linkedIn: e.target.value })}
                        onBlur={() => saveRecruiter(recruiter.id, { linkedIn: recruiter.linkedIn ?? "" })}
                        placeholder="https://linkedin.com/in/..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="field-label" htmlFor={`recruiter-source-${recruiter.id}`}>
                      {t("detail.sourceNotes")}
                    </label>
                    <textarea
                      id={`recruiter-source-${recruiter.id}`}
                      className="field-textarea"
                      value={recruiter.source ?? ""}
                      onChange={(e) => editRecruiterLocal(recruiter.id, { source: e.target.value })}
                      onBlur={() => saveRecruiter(recruiter.id, { source: recruiter.source ?? "" })}
                      placeholder={t("detail.sourceNotesPlaceholder")}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="notes">
            {t("common.notes")}
          </label>
          <textarea
            id="notes"
            className="field-textarea"
            value={item.notes ?? ""}
            onChange={(e) => setItem({ ...item, notes: e.target.value })}
            onBlur={() => save({ notes: item.notes ?? "" })}
          />
        </div>

        <div id="assistant" className="list-card scroll-mt-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="section-title">{t("detail.assistant")}</div>
              <p className="section-subtitle">
                {t("detail.assistantHelp")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="badge badge-neutral">
                {contextLoading
                  ? t("detail.loadingContext")
                  : contextStatus
                    ? t("detail.contextSummary", {
                        docs: contextStatus.documentCount,
                        chunks: contextStatus.chunkCount,
                      })
                    : t("detail.noContext")}
              </div>
              <button
                className="app-button"
                onClick={syncApplicationContext}
                disabled={contextSyncing}
              >
                {contextSyncing ? t("detail.syncing") : t("detail.syncContext")}
              </button>
            </div>
          </div>

          <div className="section-subtitle">
            {t("detail.resyncHelp")}
            {contextStatus?.lastSyncedAt
              ? t("detail.lastSynced", {
                  time: new Date(contextStatus.lastSyncedAt).toLocaleString(dateLocale),
                })
              : null}
          </div>

          {contextError ? <div className="error-banner">{contextError}</div> : null}

          {contextWarnings.length > 0 ? (
            <div className="list-card space-y-2">
              <div className="section-title">{t("detail.syncNotes")}</div>
              {contextWarnings.map((warning) => (
                <div key={warning} className="section-subtitle">
                  {warning}
                </div>
              ))}
            </div>
          ) : null}

          {contextStatus?.documents?.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {contextStatus.documents.map((document) => (
                <div key={document.id} className="result-card-compact">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{document.title}</div>
                      <div className="section-subtitle">
                        {tValue("sourceType", document.sourceType)}
                      </div>
                    </div>
                    <div className="badge badge-neutral">
                      {t("detail.chunks", { count: document.chunkCount })}
                    </div>
                  </div>
                  {document.url ? (
                    <a
                      className="subtle-link"
                      href={document.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {formatSourceLabel(document.url, t("common.openSource"))}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              {t("detail.syncEmpty")}
            </div>
          )}

          <ApplicationAssistant
            applicationId={item.id}
            hasContext={(contextStatus?.chunkCount ?? 0) > 0}
            recruiters={recruiters}
            followUps={followUps}
            onFollowUpsChanged={() => void loadFollowUps(item.id)}
            onApplicationChanged={() => void load(item.id)}
          />
        </div>

        <div className="soft-divider" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button className="app-button-secondary" onClick={remove}>
            {t("detail.deleteApplication")}
          </button>
          <div className="badge badge-neutral">{saving ? t("common.saving") : t("detail.allSaved")}</div>
        </div>
      </section>
    </PageFrame>
  );
}
