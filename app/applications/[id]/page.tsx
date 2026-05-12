"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageFrame } from "@/components/PageFrame";

type Application = {
  id: string;
  company: string;
  role: string;
  link?: string | null;
  stage: string;
  dateApplied: string;
  notes?: string | null;
  followUpDate?: string | null;
  recruiterName?: string | null;
  recruiterTitle?: string | null;
  recruiterEmail?: string | null;
  recruiterLinkedIn?: string | null;
  recruiterSource?: string | null;
};

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

type ApplicationAskResponse = {
  answer: string;
  matches: Array<{
    id: string;
    score: number;
    content: string;
    sourceType: string;
    title: string;
    url?: string | null;
  }>;
};

const QUICK_RAG_PROMPTS = [
  "Summarize this role and the biggest priorities.",
  "Draft a short recruiter follow-up email for this application.",
  "What skills or experience should I emphasize if I hear back?",
] as const;

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

function emailRelevanceLabel(score: number) {
  if (score >= 10) return "Strong match";
  if (score >= 6) return "Recruiting lead";
  if (score >= 3) return "Possible lead";
  return "Company email";
}

function formatSourceType(sourceType: string) {
  return sourceType
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [item, setItem] = useState<Application | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingFU, setCreatingFU] = useState(false);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchResults, setResearchResults] =
    useState<ContactResearchResponse | null>(null);
  const [contextStatus, setContextStatus] = useState<ContextStatus | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextSyncing, setContextSyncing] = useState(false);
  const [contextWarnings, setContextWarnings] = useState<string[]>([]);
  const [contextError, setContextError] = useState<string | null>(null);
  const [askQuestion, setAskQuestion] = useState<string>(
    QUICK_RAG_PROMPTS[0]
  );
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [askResult, setAskResult] = useState<ApplicationAskResponse | null>(null);

  async function load(appId: string) {
    const res = await fetch(`/api/applications/${appId}`);
    if (!res.ok) {
      setItem(null);
      return;
    }
    const data = await res.json();
    setItem(data.item ?? null);
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
            : "Could not load application context."
        );
      }

      setContextStatus(data.status ?? null);
      setContextWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    } catch (error) {
      setContextError(
        error instanceof Error
          ? error.message
          : "Could not load application context."
      );
    } finally {
      setContextLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    void load(id);
    void loadContextStatus(id);
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
    if (!confirm("Delete this application?")) return;
    await fetch(`/api/applications/${item.id}`, { method: "DELETE" });
    router.push("/applications");
  }

  async function quickFollowUp() {
    if (!item) return;
    setCreatingFU(true);

    const followDate = item.followUpDate ?? addDays(item.dateApplied, 7);

    const checkRes = await fetch(
      `/api/reminders/exists?applicationId=${encodeURIComponent(
        item.id
      )}&date=${encodeURIComponent(followDate)}`
    );
    const checkData = await checkRes.json();

    if (checkData.exists) {
      setCreatingFU(false);
      alert("A follow up reminder already exists for this date.");
      return;
    }

    if (!item.followUpDate) {
      const res = await fetch(`/api/applications/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followUpDate: followDate }),
      });
      if (res.ok) {
        const data = await res.json();
        setItem(data.item);
      }
    }

    await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: followDate,
        time: "09:00",
        message: `Follow up: ${item.company} | ${item.role}`,
        applicationId: item.id,
      }),
    });

    setCreatingFU(false);
    alert(`Follow up reminder created for ${followDate}`);
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
          typeof data?.error === "string" ? data.error : "Search failed."
        );
      }

      setResearchResults(data);
    } catch (error) {
      setResearchError(
        error instanceof Error ? error.message : "Could not run contact research."
      );
    } finally {
      setResearchLoading(false);
    }
  }

  function applyContactFields(patch: Partial<Application>) {
    if (!item) return;
    const next = { ...item, ...patch };
    setItem(next);
    void save(patch);
  }

  async function syncApplicationContext() {
    if (!item) return;

    setContextSyncing(true);
    setContextError(null);
    setAskError(null);

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
            : "Could not sync application context."
        );
      }

      setContextStatus(data.status ?? null);
      setContextWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    } catch (error) {
      setContextError(
        error instanceof Error
          ? error.message
          : "Could not sync application context."
      );
    } finally {
      setContextSyncing(false);
    }
  }

  async function askApplicationContext() {
    if (!item) return;

    const question = askQuestion.trim();
    if (!question) {
      setAskError("Ask a question first.");
      return;
    }

    setAskLoading(true);
    setAskError(null);

    try {
      const res = await fetch(`/api/applications/${item.id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = (await res.json()) as ApplicationAskResponse & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Could not answer the question."
        );
      }

      setAskResult(data);
    } catch (error) {
      setAskError(
        error instanceof Error ? error.message : "Could not answer the question."
      );
    } finally {
      setAskLoading(false);
    }
  }

  if (!id) {
    return (
      <PageFrame
        title="Loading application"
        subtitle="Pulling application details into the editor."
      >
        <section className="panel-card">
          <div className="empty-state">Loading...</div>
        </section>
      </PageFrame>
    );
  }

  if (!item) {
    return (
      <PageFrame
        title="Application not found"
        subtitle="The record could not be loaded."
        actions={
          <Link href="/applications" className="app-button-secondary">
            Back to Applications
          </Link>
        }
      >
        <section className="panel-card">
          <div className="empty-state">Loading...</div>
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
      title={`${item.company}`}
      subtitle="Edit the record, keep follow-up timing tight, and capture notes while the context is fresh."
      actions={
        <>
          <span className={stageBadgeClass(item.stage)}>{item.stage}</span>
          <Link href="/applications" className="app-button-secondary">
            Back
          </Link>
        </>
      }
    >
      <section className="panel-card space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="company">
              Company
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
              Role
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
              Job Link
            </label>
            <input
              id="link"
              className="field-input"
              value={item.link ?? ""}
              onChange={(e) => setItem({ ...item, link: e.target.value })}
              onBlur={() => save({ link: item.link ?? "" })}
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="field-label" htmlFor="stage">
              Stage
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
              <option value="applied">applied</option>
              <option value="interview">interview</option>
              <option value="rejected">rejected</option>
              <option value="offer">offer</option>
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="date-applied">
              Applied Date
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

          <div>
            <label className="field-label" htmlFor="follow-up-date">
              Follow-up Date
            </label>
            <input
              id="follow-up-date"
              className="field-input"
              type="date"
              value={item.followUpDate ?? ""}
              onChange={(e) => setItem({ ...item, followUpDate: e.target.value })}
              onBlur={() => save({ followUpDate: item.followUpDate ?? "" })}
            />
          </div>
        </div>

        <div className="list-card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="section-title">Quick follow-up</div>
              <p className="section-subtitle">
                Create a linked reminder using the existing follow-up date, or default to seven days after applying.
              </p>
            </div>

            <button
              className="app-button"
              onClick={quickFollowUp}
              disabled={creatingFU}
            >
              {creatingFU ? "Creating..." : "Create reminder"}
            </button>
          </div>
        </div>

        <div className="list-card space-y-4">
          <div className="space-y-2">
            <div className="section-title">Contact research</div>
            <p className="section-subtitle">
              Prioritize recruiter and talent-team emails first, then use profiles and company pages as supporting context. Long result lists stay inside scrollable panels so this page stays usable.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex flex-wrap gap-2">
              <button
                className="app-button"
                onClick={runContactResearch}
                disabled={researchLoading}
              >
                {researchLoading ? "Searching..." : "Find recruiter emails"}
              </button>
              {researchResults ? (
                <div className="badge badge-neutral">{researchResults.provider}</div>
              ) : null}
            </div>

            {researchResults ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="mini-stat">
                  <div className="mini-stat-label">Recruiter Emails</div>
                  <div className="mini-stat-value">
                    {researchResults.recruiterEmails.length}
                  </div>
                </div>
                <div className="mini-stat">
                  <div className="mini-stat-label">Other Emails</div>
                  <div className="mini-stat-value">
                    {researchResults.otherEmails.length}
                  </div>
                </div>
                <div className="mini-stat">
                  <div className="mini-stat-label">Profiles</div>
                  <div className="mini-stat-value">
                    {researchResults.profiles.length}
                  </div>
                </div>
                <div className="mini-stat">
                  <div className="mini-stat-label">Pages</div>
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
              Search recruiter + role
            </a>
            <a className="app-button-secondary" href={talentSearchUrl} target="_blank" rel="noreferrer">
              Search talent acquisition
            </a>
            <a className="app-button-secondary" href={linkedinSearchUrl} target="_blank" rel="noreferrer">
              Search LinkedIn profiles
            </a>
            <a className="app-button-secondary" href={careersSearchUrl} target="_blank" rel="noreferrer">
              Search careers contact
            </a>
            {companySiteSearchUrl ? (
              <a
                className="app-button-secondary"
                href={companySiteSearchUrl}
                target="_blank"
                rel="noreferrer"
              >
                Search company site
              </a>
            ) : null}
            {host ? (
              <a
                className="app-button-ghost"
                href={`https://${host}`}
                target="_blank"
                rel="noreferrer"
              >
                Open {host}
              </a>
            ) : null}
          </div>

          <div className="list-card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="section-title">Saved contact details</div>
                <p className="section-subtitle">
                  Keep the best contact you found here so you can reuse it later for follow-ups and outreach.
                </p>
              </div>
              {item.recruiterEmail || item.recruiterLinkedIn || item.recruiterSource ? (
                <div className="badge badge-neutral">Saved</div>
              ) : (
                <div className="badge badge-neutral">Nothing saved yet</div>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="mini-stat">
                <div className="mini-stat-label">Email</div>
                <div className="mini-stat-value text-base">
                  {item.recruiterEmail || "Not saved"}
                </div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-label">Profile</div>
                <div className="mini-stat-value text-base">
                  {item.recruiterLinkedIn ? formatSourceLabel(item.recruiterLinkedIn, "Saved link") : "Not saved"}
                </div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-label">Source</div>
                <div className="mini-stat-value text-base">
                  {item.recruiterSource ? formatSourceLabel(item.recruiterSource, "Saved source") : "Not saved"}
                </div>
              </div>
            </div>
          </div>

          {researchResults ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="space-y-4">
                <div className="panel-card space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="section-title">Recruiter email candidates</div>
                      <p className="section-subtitle">
                        These are the strongest email matches from recruiting, talent, hiring, and careers-related public snippets.
                      </p>
                    </div>
                    <div className="badge badge-neutral">
                      {researchResults.recruiterEmails.length} matches
                    </div>
                  </div>

                  {researchResults.recruiterEmails.length === 0 ? (
                    <div className="empty-state">
                      No recruiter-specific emails surfaced yet. Try the external searches or open the company site.
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
                                  {emailRelevanceLabel(mention.relevance)}
                                </span>
                              </div>
                            </div>
                            <button
                              className="app-button"
                              onClick={() =>
                                applyContactFields({
                                  recruiterEmail: mention.email,
                                  recruiterSource: mention.sourceUrl,
                                })
                              }
                            >
                              Save email
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
                              {formatSourceLabel(mention.sourceUrl, "Public source")}
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
                      <div className="section-title">Other company emails</div>
                      <p className="section-subtitle">
                        Broader company addresses can still be useful if you need a fallback contact or a verified source page.
                      </p>
                    </div>
                    <div className="badge badge-neutral">
                      {researchResults.otherEmails.length} matches
                    </div>
                  </div>

                  {researchResults.otherEmails.length === 0 ? (
                    <div className="empty-state">
                      No broader company email mentions were found in the returned snippets.
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
                                  {emailRelevanceLabel(mention.relevance)}
                                </span>
                              </div>
                            </div>
                            <button
                              className="app-button-secondary"
                              onClick={() =>
                                applyContactFields({
                                  recruiterEmail: mention.email,
                                  recruiterSource: mention.sourceUrl,
                                })
                              }
                            >
                              Save fallback
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
                      <div className="section-title">Profiles</div>
                      <p className="section-subtitle">
                        Public LinkedIn-style profiles that may help you identify the right recruiter or sourcer.
                      </p>
                    </div>
                    <div className="badge badge-neutral">
                      {researchResults.profiles.length} profiles
                    </div>
                  </div>

                  {researchResults.profiles.length === 0 ? (
                    <div className="empty-state">No public profiles found yet.</div>
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
                              Open source
                            </a>
                            <button
                              className="app-button-secondary"
                              onClick={() =>
                                applyContactFields({
                                  recruiterLinkedIn: result.url ?? "",
                                  recruiterSource: result.url ?? "",
                                })
                              }
                            >
                              Save profile
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
                      <div className="section-title">Company pages</div>
                      <p className="section-subtitle">
                        Careers pages and recruiting hubs are useful for confirming whether an email or contact path looks legitimate.
                      </p>
                    </div>
                    <div className="badge badge-neutral">
                      {researchResults.companyPages.length} pages
                    </div>
                  </div>

                  {researchResults.companyPages.length === 0 ? (
                    <div className="empty-state">No company pages found yet.</div>
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
                              Open source
                            </a>
                            <button
                              className="app-button-secondary"
                              onClick={() =>
                                applyContactFields({
                                  recruiterSource: result.url ?? "",
                                })
                              }
                            >
                              Save source
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

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="recruiter-name">
                Recruiter name
              </label>
              <input
                id="recruiter-name"
                className="field-input"
                value={item.recruiterName ?? ""}
                onChange={(e) =>
                  setItem({ ...item, recruiterName: e.target.value })
                }
                onBlur={() => save({ recruiterName: item.recruiterName ?? "" })}
                placeholder="Jordan Lee"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="recruiter-title">
                Recruiter title
              </label>
              <input
                id="recruiter-title"
                className="field-input"
                value={item.recruiterTitle ?? ""}
                onChange={(e) =>
                  setItem({ ...item, recruiterTitle: e.target.value })
                }
                onBlur={() => save({ recruiterTitle: item.recruiterTitle ?? "" })}
                placeholder="Senior Technical Recruiter"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="recruiter-email">
                Recruiter email
              </label>
              <input
                id="recruiter-email"
                className="field-input"
                type="email"
                value={item.recruiterEmail ?? ""}
                onChange={(e) =>
                  setItem({ ...item, recruiterEmail: e.target.value })
                }
                onBlur={() => save({ recruiterEmail: item.recruiterEmail ?? "" })}
                placeholder="name@company.com"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="recruiter-linkedin">
                LinkedIn or public profile
              </label>
              <input
                id="recruiter-linkedin"
                className="field-input"
                value={item.recruiterLinkedIn ?? ""}
                onChange={(e) =>
                  setItem({ ...item, recruiterLinkedIn: e.target.value })
                }
                onBlur={() =>
                  save({ recruiterLinkedIn: item.recruiterLinkedIn ?? "" })
                }
                placeholder="https://linkedin.com/in/..."
              />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="recruiter-source">
              Source notes
            </label>
            <textarea
              id="recruiter-source"
              className="field-textarea"
              value={item.recruiterSource ?? ""}
              onChange={(e) =>
                setItem({ ...item, recruiterSource: e.target.value })
              }
              onBlur={() => save({ recruiterSource: item.recruiterSource ?? "" })}
              placeholder="Where you found the contact info, team page, recruiter profile, careers page, etc."
            />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            className="field-textarea"
            value={item.notes ?? ""}
            onChange={(e) => setItem({ ...item, notes: e.target.value })}
            onBlur={() => save({ notes: item.notes ?? "" })}
          />
        </div>

        <div className="list-card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="section-title">Application assistant</div>
              <p className="section-subtitle">
                Sync the role link, notes, and recruiter details into retrievable context, then ask grounded questions about this application.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="badge badge-neutral">
                {contextLoading
                  ? "Loading context..."
                  : contextStatus
                    ? `${contextStatus.documentCount} docs • ${contextStatus.chunkCount} chunks`
                    : "No context yet"}
              </div>
              <button
                className="app-button"
                onClick={syncApplicationContext}
                disabled={contextSyncing}
              >
                {contextSyncing ? "Syncing..." : "Sync context"}
              </button>
            </div>
          </div>

          <div className="section-subtitle">
            Re-sync after changing the job link, recruiter details, or notes.
            {contextStatus?.lastSyncedAt
              ? ` Last synced ${new Date(contextStatus.lastSyncedAt).toLocaleString()}.`
              : null}
          </div>

          {contextError ? <div className="error-banner">{contextError}</div> : null}

          {contextWarnings.length > 0 ? (
            <div className="list-card space-y-2">
              <div className="section-title">Sync notes</div>
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
                        {formatSourceType(document.sourceType)}
                      </div>
                    </div>
                    <div className="badge badge-neutral">
                      {document.chunkCount} chunks
                    </div>
                  </div>
                  {document.url ? (
                    <a
                      className="subtle-link"
                      href={document.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {formatSourceLabel(document.url, "Open source")}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              Syncing creates indexed context from this application so the assistant can answer with sources.
            </div>
          )}

          <div className="panel-card space-y-3">
            <div className="flex flex-wrap gap-2">
              {QUICK_RAG_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  className="app-button-secondary"
                  onClick={() => setAskQuestion(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div>
              <label className="field-label" htmlFor="ask-application">
                Ask a question
              </label>
              <textarea
                id="ask-application"
                className="field-textarea"
                value={askQuestion}
                onChange={(e) => setAskQuestion(e.target.value)}
                placeholder="What should I emphasize for this role?"
              />
            </div>

            <div className="flex justify-end">
              <button
                className="app-button"
                onClick={askApplicationContext}
                disabled={askLoading}
              >
                {askLoading ? "Thinking..." : "Ask assistant"}
              </button>
            </div>

            {askError ? <div className="error-banner">{askError}</div> : null}

            {askResult ? (
              <div className="space-y-4">
                <div className="result-card-compact space-y-3">
                  <div className="section-title">Answer</div>
                  <div className="whitespace-pre-wrap">{askResult.answer}</div>
                </div>

                <div className="space-y-3">
                  <div className="section-title">Retrieved sources</div>
                  <div className="scroll-panel space-y-3">
                    {askResult.matches.map((match) => (
                      <div key={match.id} className="result-card-compact">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">{match.title}</div>
                            <div className="section-subtitle">
                              {formatSourceType(match.sourceType)}
                            </div>
                          </div>
                          <div className="badge badge-neutral">
                            score {match.score}
                          </div>
                        </div>
                        <div className="result-snippet">{match.content}</div>
                        {match.url ? (
                          <a
                            className="subtle-link"
                            href={match.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {formatSourceLabel(match.url, "Open source")}
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="soft-divider" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button className="app-button-secondary" onClick={remove}>
            Delete application
          </button>
          <div className="badge badge-neutral">{saving ? "Saving..." : "All changes saved"}</div>
        </div>
      </section>
    </PageFrame>
  );
}
