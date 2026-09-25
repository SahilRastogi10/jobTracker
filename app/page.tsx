"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { TODAY_CHANGED_EVENT } from "@/components/AppNav";
import { useI18n } from "@/components/LanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { PageFrame } from "@/components/PageFrame";
import { localYYYYMMDD } from "@/lib/localDate";

type Application = {
  id: string;
  company: string;
  role: string;
  stage: string;
  dateApplied: string;
};

type AppLite = {
  id: string;
  company: string;
  role: string;
};

type Reminder = {
  id: string;
  date: string;
  time: string;
  message: string;
  done: boolean;
  followUpId?: string | null;
  application?: { id: string; company: string; role: string } | null;
};

type FollowUp = {
  id: string;
  dueDate: string;
  channel: string;
  application: { id: string; company: string; role: string; stage: string };
  recruiter?: { id: string; name?: string | null; email?: string | null } | null;
  hasReminder: boolean;
};

type PendingDraft = {
  id: string;
  createdAt: string;
  kind: string;
  application: { id: string; company: string; role: string };
};

type TodayResponse = {
  goal: { targetCount: number };
  note: { text: string };
  todaysApps: Application[];
};

type AgendaItem =
  | { kind: "follow-up"; key: string; date: string; time: string; followUp: FollowUp; reminder?: Reminder }
  | { kind: "reminder"; key: string; date: string; time: string; reminder: Reminder }
  | { kind: "review"; key: string; date: string; time: string; draft: PendingDraft };

const AGENDA_DAYS_AHEAD = 7;

function addDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return localYYYYMMDD(date);
}

function formatDay(
  ymd: string,
  today: string,
  t: (key: MessageKey) => string,
  dateLocale: string
) {
  if (ymd === today) return t("common.today");
  if (ymd === addDays(today, 1)) return t("common.tomorrow");
  if (ymd === addDays(today, -1)) return t("common.yesterday");
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time: string, dateLocale: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(dateLocale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function greetingKey(): MessageKey {
  const hour = new Date().getHours();
  if (hour < 12) return "today.morning";
  if (hour < 18) return "today.afternoon";
  return "today.evening";
}

function stageBadgeClass(stage: string) {
  switch (stage) {
    case "interview":
      return "badge badge-interview";
    case "offer":
      return "badge badge-offer";
    case "rejected":
      return "badge badge-rejected";
    default:
      return "badge badge-applied";
  }
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Request failed.");
  }

  return data as T;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function notifyTodayChanged() {
  window.dispatchEvent(new Event(TODAY_CHANGED_EVENT));
}

export default function TodayPage() {
  const { t, tValue, dateLocale } = useI18n();
  const [today] = useState(localYYYYMMDD());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [goal, setGoal] = useState(5);
  const [todaysApps, setTodaysApps] = useState<Application[]>([]);
  const [note, setNote] = useState("");
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved">("idle");

  const [overdueReminders, setOverdueReminders] = useState<Reminder[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<Reminder[]>([]);
  const [overdueFollowUps, setOverdueFollowUps] = useState<FollowUp[]>([]);
  const [upcomingFollowUps, setUpcomingFollowUps] = useState<FollowUp[]>([]);
  const [pendingDrafts, setPendingDrafts] = useState<PendingDraft[]>([]);
  const [appsLite, setAppsLite] = useState<AppLite[]>([]);

  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [appDate, setAppDate] = useState(today);
  const [submittingApplication, setSubmittingApplication] = useState(false);

  const [remMsg, setRemMsg] = useState("");
  const [remDate, setRemDate] = useState(today);
  const [remTime, setRemTime] = useState("09:00");
  const [remAppId, setRemAppId] = useState("");
  const [submittingReminder, setSubmittingReminder] = useState(false);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openings, setOpenings] = useState<{
    count: number;
    latest: Array<{ id: string; company: string; title: string; url: string }>;
  } | null>(null);
  const saveTimer = useRef<number | null>(null);

  async function loadAll() {
    try {
      const [todayData, overdueRem, upcomingRem, overdueFu, upcomingFu, drafts, apps] =
        await Promise.all([
          requestJson<TodayResponse>("/api/today"),
          requestJson<{ items: Reminder[] }>("/api/reminders/overdue"),
          requestJson<{ items: Reminder[] }>("/api/reminders/upcoming"),
          requestJson<{ items: FollowUp[] }>("/api/followups/overdue"),
          requestJson<{ items: FollowUp[] }>("/api/followups/upcoming"),
          requestJson<{ items: PendingDraft[] }>("/api/drafts?status=pending_review"),
          requestJson<{ items: AppLite[] }>("/api/applications/simple"),
        ]);

      setGoal(todayData.goal.targetCount);
      setTodaysApps(todayData.todaysApps ?? []);
      setNote((current) => (noteStatus === "idle" ? todayData.note.text : current));
      setOverdueReminders(overdueRem.items ?? []);
      setUpcomingReminders(upcomingRem.items ?? []);
      setOverdueFollowUps(overdueFu.items ?? []);
      setUpcomingFollowUps(upcomingFu.items ?? []);
      setPendingDrafts(drafts.items ?? []);
      setAppsLite(apps.items ?? []);
    } catch (loadError) {
      setError(getErrorMessage(loadError, t("today.errLoad")));
    } finally {
      setLoading(false);
    }
  }

  // Loaded on its own so a slow first download of the feed never holds up the agenda.
  useEffect(() => {
    requestJson<{ counts: { "24h": number }; items: Array<{ id: string; company: string; title: string; url: string }> }>(
      "/api/job-feed?window=24h"
    )
      .then((data) => setOpenings({ count: data.counts["24h"], latest: data.items.slice(0, 3) }))
      .catch(() => setOpenings(null));
  }, []);

  useEffect(() => {
    void loadAll();
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agenda = useMemo(() => {
    const horizon = addDays(today, AGENDA_DAYS_AHEAD);
    const followUps = [...overdueFollowUps, ...upcomingFollowUps];
    const followUpIds = new Set(followUps.map((followUp) => followUp.id));
    const reminders = [...overdueReminders, ...upcomingReminders];

    // A reminder created for a follow-up is shown on that follow-up's row, not twice.
    const reminderByFollowUp = new Map<string, Reminder>();
    for (const reminder of reminders) {
      if (reminder.followUpId && followUpIds.has(reminder.followUpId)) {
        reminderByFollowUp.set(reminder.followUpId, reminder);
      }
    }

    const items: AgendaItem[] = [
      ...followUps.map((followUp) => {
        const reminder = reminderByFollowUp.get(followUp.id);
        return {
          kind: "follow-up" as const,
          key: `f-${followUp.id}`,
          date: followUp.dueDate,
          time: reminder?.time ?? "",
          followUp,
          reminder,
        };
      }),
      ...reminders
        .filter((reminder) => !(reminder.followUpId && followUpIds.has(reminder.followUpId)))
        .map((reminder) => ({
          kind: "reminder" as const,
          key: `r-${reminder.id}`,
          date: reminder.date,
          time: reminder.time,
          reminder,
        })),
      ...pendingDrafts.map((draft) => ({
        kind: "review" as const,
        key: `d-${draft.id}`,
        date: today,
        time: "",
        draft,
      })),
    ];

    items.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    return {
      overdue: items.filter((item) => item.date < today),
      today: items.filter((item) => item.date === today),
      soon: items.filter((item) => item.date > today && item.date <= horizon),
      later: items.filter((item) => item.date > horizon).length,
    };
  }, [today, overdueFollowUps, upcomingFollowUps, overdueReminders, upcomingReminders, pendingDrafts]);

  const needsYou = agenda.overdue.length + agenda.today.length;

  async function run(key: string, action: () => Promise<unknown>, fallback: string) {
    setBusyKey(key);
    setError(null);
    try {
      await action();
      await loadAll();
    } catch (actionError) {
      setError(getErrorMessage(actionError, fallback));
    } finally {
      setBusyKey(null);
    }
  }

  function completeReminder(reminder: Reminder) {
    return run(
      `r-${reminder.id}`,
      () =>
        requestJson(`/api/reminders/${reminder.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: true }),
        }),
      t("today.errReminder")
    );
  }

  function markFollowUpSent(followUp: FollowUp) {
    return run(
      `f-${followUp.id}`,
      () =>
        requestJson(`/api/followups/${followUp.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "sent" }),
        }),
      t("today.errSent")
    );
  }

  function remindForFollowUp(followUp: FollowUp) {
    return run(
      `f-${followUp.id}`,
      () =>
        requestJson("/api/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: followUp.dueDate < today ? today : followUp.dueDate,
            time: "09:00",
            message: t("today.followUpReminder", {
              company: followUp.application.company,
              role: followUp.application.role,
            }),
            followUpId: followUp.id,
          }),
        }),
      t("today.errCreateReminder")
    );
  }

  function clearOverdueReminders() {
    const ids = agenda.overdue
      .filter((item): item is Extract<AgendaItem, { kind: "reminder" }> => item.kind === "reminder")
      .map((item) => item.reminder.id);

    return run(
      "overdue-batch",
      () =>
        requestJson("/api/reminders/batch", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, done: true }),
        }),
      t("today.errBatch")
    );
  }

  async function saveGoal(nextGoal: number) {
    if (!Number.isFinite(nextGoal) || nextGoal < 0) return;
    setGoal(nextGoal);

    try {
      await requestJson("/api/goal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCount: nextGoal }),
      });
      notifyTodayChanged();
    } catch (saveError) {
      setError(getErrorMessage(saveError, t("today.errGoal")));
    }
  }

  async function addApplication() {
    setSubmittingApplication(true);
    setError(null);

    try {
      await requestJson("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, role, dateApplied: appDate }),
      });
      setCompany("");
      setRole("");
      setAppDate(today);
      notifyTodayChanged();
      await loadAll();
    } catch (submitError) {
      setError(getErrorMessage(submitError, t("today.errAddApplication")));
    } finally {
      setSubmittingApplication(false);
    }
  }

  async function addReminder() {
    setSubmittingReminder(true);
    setError(null);

    try {
      await requestJson("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: remDate,
          time: remTime,
          message: remMsg,
          applicationId: remAppId || null,
        }),
      });
      setRemMsg("");
      setRemAppId("");
      setRemDate(today);
      await loadAll();
    } catch (submitError) {
      setError(getErrorMessage(submitError, t("today.errAddReminder")));
    } finally {
      setSubmittingReminder(false);
    }
  }

  function onNoteChange(next: string) {
    setNote(next);
    setNoteStatus("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);

    saveTimer.current = window.setTimeout(async () => {
      try {
        await requestJson("/api/note", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: next }),
        });
        setNoteStatus("saved");
      } catch (saveError) {
        setError(getErrorMessage(saveError, t("today.errNote")));
        setNoteStatus("idle");
      }
    }, 600);
  }

  function renderItem(item: AgendaItem, overdue: boolean) {
    const busy = busyKey === item.key;

    if (item.kind === "follow-up") {
      const { followUp, reminder } = item;
      const recipient = followUp.recruiter?.name || followUp.recruiter?.email;

      return (
        <li key={item.key} className="agenda-item" data-kind="follow-up" data-overdue={overdue}>
          <div className="agenda-when">
            {formatDay(item.date, today, t, dateLocale)}
            {reminder ? <div className="font-normal">{formatTime(reminder.time, dateLocale)}</div> : null}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="agenda-kind">
                {t("today.followUpBy", { channel: tValue("channel", followUp.channel) })}
              </div>
              <Link
                href={`/applications/${followUp.application.id}`}
                className="block font-semibold hover:text-[color:var(--accent)]"
              >
                {followUp.application.company}
              </Link>
              <div className="section-subtitle">
                {followUp.application.role}
                {recipient ? t("today.toRecipient", { name: recipient }) : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!followUp.hasReminder ? (
                <button
                  className="app-button-ghost"
                  onClick={() => remindForFollowUp(followUp)}
                  disabled={busy}
                >
                  {t("today.remindMe")}
                </button>
              ) : null}
              <button
                className="app-button-secondary"
                onClick={() => markFollowUpSent(followUp)}
                disabled={busy}
              >
                {busy ? t("common.saving") : t("today.markSent")}
              </button>
            </div>
          </div>
        </li>
      );
    }

    if (item.kind === "reminder") {
      const { reminder } = item;

      return (
        <li key={item.key} className="agenda-item" data-kind="reminder" data-overdue={overdue}>
          <div className="agenda-when">
            {formatDay(item.date, today, t, dateLocale)}
            <div className="font-normal">{formatTime(reminder.time, dateLocale)}</div>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="agenda-kind">{t("today.reminder")}</div>
              <div className="font-semibold">{reminder.message}</div>
              {reminder.application ? (
                <Link className="subtle-link" href={`/applications/${reminder.application.id}`}>
                  {reminder.application.company}
                </Link>
              ) : null}
            </div>
            <button
              className="app-button-secondary"
              onClick={() => completeReminder(reminder)}
              disabled={busy}
            >
              {busy ? t("common.saving") : t("common.done")}
            </button>
          </div>
        </li>
      );
    }

    const { draft } = item;
    return (
      <li key={item.key} className="agenda-item" data-kind="review" data-overdue={false}>
        <div className="agenda-when">{t("today.waiting")}</div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="agenda-kind">{t("today.reviewDraft")}</div>
            <div className="font-semibold">
              {t(draft.kind === "follow_up_email" ? "today.followUpMessageFor" : "today.answerFor", {
                company: draft.application.company,
              })}
            </div>
            <div className="section-subtitle">{t("today.notUsedUntilApproved")}</div>
          </div>
          <Link className="app-button" href={`/applications/${draft.application.id}#assistant`}>
            {t("today.review")}
          </Link>
        </div>
      </li>
    );
  }

  function renderGroup(
    label: string,
    items: AgendaItem[],
    overdue: boolean,
    action?: React.ReactNode
  ) {
    if (items.length === 0) return null;

    return (
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="agenda-group-label">
            {label} <span>{items.length}</span>
          </div>
          {action}
        </div>
        <ul className="space-y-2">{items.map((item) => renderItem(item, overdue))}</ul>
      </section>
    );
  }

  const overdueReminderCount = agenda.overdue.filter((item) => item.kind === "reminder").length;
  const goalDots = Math.min(Math.max(goal, 1), 10);
  const filledDots = goal > 0 ? Math.round((Math.min(todaysApps.length, goal) / goal) * goalDots) : 0;

  const subtitle = loading
    ? t("today.loadingSubtitle")
    : needsYou === 0
      ? t("today.allClearSubtitle")
      : `${needsYou === 1 ? t("today.needsOne") : t("today.needsMany", { count: needsYou })}${
          agenda.overdue.length === 1
            ? t("today.overdueSuffixOne")
            : agenda.overdue.length > 1
              ? t("today.overdueSuffix", { count: agenda.overdue.length })
              : ""
        }.`;

  return (
    <PageFrame
      eyebrow={new Date().toLocaleDateString(dateLocale, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}
      title={
        <>
          {t(greetingKey())}
          <em>.</em>
        </>
      }
      subtitle={subtitle}
      actions={
        <Link href="/applications" className="app-button-secondary">
          {t("today.openPipeline")}
        </Link>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-7">
          {loading ? (
            <div className="empty-state">{t("today.loadingAgenda")}</div>
          ) : needsYou === 0 && agenda.soon.length === 0 ? (
            <div className="panel-card py-10 text-center">
              <div className="font-display text-2xl">{t("today.allClear")}</div>
              <p className="section-subtitle mt-2">
                {t("today.allClearBody")}
              </p>
            </div>
          ) : (
            <>
              {renderGroup(
                t("today.groupOverdue"),
                agenda.overdue,
                true,
                overdueReminderCount > 1 ? (
                  <button
                    className="app-button-ghost"
                    onClick={clearOverdueReminders}
                    disabled={busyKey === "overdue-batch"}
                  >
                    {t("today.markRemindersDone", { count: overdueReminderCount })}
                  </button>
                ) : null
              )}
              {renderGroup(t("today.groupToday"), agenda.today, false)}
              {agenda.today.length === 0 && agenda.overdue.length === 0 ? (
                <div className="empty-state">{t("today.nothingToday")}</div>
              ) : null}
              {renderGroup(t("today.groupSoon", { days: AGENDA_DAYS_AHEAD }), agenda.soon, false)}
              {agenda.later > 0 ? (
                <Link className="subtle-link" href="/calendar">
                  {t("today.moreLater", { count: agenda.later })}
                </Link>
              ) : null}
            </>
          )}
        </div>

        <aside className="space-y-4">
          <div className="panel-card space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="mini-stat-label">{t("today.appliedToday")}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-5xl font-medium leading-none">
                    {todaysApps.length}
                  </span>
                  <span className="section-subtitle">{t("today.ofGoal", { goal })}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="app-button-secondary !min-h-9 !px-3"
                  onClick={() => saveGoal(Math.max(0, goal - 1))}
                  aria-label={t("today.lowerGoal")}
                >
                  -
                </button>
                <button
                  className="app-button-secondary !min-h-9 !px-3"
                  onClick={() => saveGoal(goal + 1)}
                  aria-label={t("today.raiseGoal")}
                >
                  +
                </button>
              </div>
            </div>

            <div className="goal-meter">
              {Array.from({ length: goalDots }, (_, index) => (
                <div key={index} className={`goal-meter-dot ${index < filledDots ? "is-filled" : ""}`} />
              ))}
            </div>

            {todaysApps.length > 0 ? (
              <ul className="space-y-1.5">
                {todaysApps.map((application) => (
                  <li key={application.id} className="flex items-center justify-between gap-2">
                    <Link className="font-medium hover:underline" href={`/applications/${application.id}`}>
                      {application.company}
                    </Link>
                    <span className={stageBadgeClass(application.stage)}>
                      {tValue("stage", application.stage)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="section-subtitle">
                {goal > 0 ? t("today.logFirst", { goal }) : t("today.noGoal")}
              </p>
            )}
          </div>

          {openings ? (
            <div className="panel-card space-y-3">
              <div>
                <div className="section-title">{t("today.newOpenings")}</div>
                <p className="section-subtitle text-sm">
                  {t("today.newOpeningsCount", { count: openings.count })}
                </p>
              </div>
              {openings.latest.length > 0 ? (
                <ul className="space-y-1.5">
                  {openings.latest.map((job) => (
                    <li key={job.id} className="min-w-0">
                      <a
                        className="block truncate text-sm font-semibold hover:text-[color:var(--accent)]"
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {job.company}
                      </a>
                      <div className="section-subtitle truncate text-xs">{job.title}</div>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link className="subtle-link text-sm" href="/jobs">
                {t("today.viewFeed")}
              </Link>
            </div>
          ) : null}

          <div className="panel-card space-y-3">
            <div className="section-title">{t("today.logApplication")}</div>
            <input
              className="field-input"
              placeholder={t("common.company")}
              aria-label={t("common.company")}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
            <input
              className="field-input"
              placeholder={t("common.role")}
              aria-label={t("common.role")}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="field-input"
                type="date"
                aria-label={t("today.appliedDate")}
                value={appDate}
                onChange={(e) => setAppDate(e.target.value)}
              />
              <button
                className="app-button"
                onClick={addApplication}
                disabled={!company.trim() || !role.trim() || submittingApplication}
              >
                {submittingApplication ? t("common.adding") : t("common.add")}
              </button>
            </div>
          </div>

          <div className="panel-card space-y-3">
            <div className="section-title">{t("today.setReminder")}</div>
            <input
              className="field-input"
              placeholder={t("today.reminderPlaceholder")}
              aria-label={t("today.reminderPlaceholder")}
              value={remMsg}
              onChange={(e) => setRemMsg(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="field-input"
                type="date"
                aria-label={t("today.reminderDate")}
                value={remDate}
                onChange={(e) => setRemDate(e.target.value)}
              />
              <input
                className="field-input"
                type="time"
                aria-label={t("today.reminderTime")}
                value={remTime}
                onChange={(e) => setRemTime(e.target.value)}
              />
            </div>
            <select
              className="field-select"
              aria-label={t("today.notLinked")}
              value={remAppId}
              onChange={(e) => setRemAppId(e.target.value)}
            >
              <option value="">{t("today.notLinked")}</option>
              {appsLite.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.company} | {application.role}
                </option>
              ))}
            </select>
            <div className="flex justify-end">
              <button
                className="app-button"
                onClick={addReminder}
                disabled={!remMsg.trim() || submittingReminder}
              >
                {submittingReminder ? t("common.adding") : t("today.addReminder")}
              </button>
            </div>
          </div>

          <div className="panel-card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="section-title">{t("common.notes")}</div>
              <span className="section-subtitle text-xs">
                {noteStatus === "saving"
                  ? t("common.saving")
                  : noteStatus === "saved"
                    ? t("today.saved")
                    : ""}
              </span>
            </div>
            <textarea
              className="field-textarea"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={t("today.notesPlaceholder")}
            />
          </div>
        </aside>
      </div>
    </PageFrame>
  );
}
