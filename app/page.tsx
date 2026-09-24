"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { TODAY_CHANGED_EVENT } from "@/components/AppNav";
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

function formatDay(ymd: string, today: string) {
  if (ymd === today) return "Today";
  if (ymd === addDays(today, 1)) return "Tomorrow";
  if (ymd === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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
      setError(getErrorMessage(loadError, "Could not load today."));
    } finally {
      setLoading(false);
    }
  }

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
      "Could not update reminder."
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
      "Could not mark follow-up sent."
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
            message: `Follow up: ${followUp.application.company} | ${followUp.application.role}`,
            followUpId: followUp.id,
          }),
        }),
      "Could not create reminder."
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
      "Could not mark reminders done."
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
      setError(getErrorMessage(saveError, "Could not save daily goal."));
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
      setError(getErrorMessage(submitError, "Could not add application."));
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
      setError(getErrorMessage(submitError, "Could not add reminder."));
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
        setError(getErrorMessage(saveError, "Could not save daily note."));
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
            {formatDay(item.date, today)}
            {reminder ? <div className="font-normal">{formatTime(reminder.time)}</div> : null}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="agenda-kind">Follow up by {followUp.channel}</div>
              <Link
                href={`/applications/${followUp.application.id}`}
                className="block font-semibold hover:text-[color:var(--accent)]"
              >
                {followUp.application.company}
              </Link>
              <div className="section-subtitle">
                {followUp.application.role}
                {recipient ? ` | to ${recipient}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!followUp.hasReminder ? (
                <button
                  className="app-button-ghost"
                  onClick={() => remindForFollowUp(followUp)}
                  disabled={busy}
                >
                  Remind me
                </button>
              ) : null}
              <button
                className="app-button-secondary"
                onClick={() => markFollowUpSent(followUp)}
                disabled={busy}
              >
                {busy ? "Saving..." : "Mark sent"}
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
            {formatDay(item.date, today)}
            <div className="font-normal">{formatTime(reminder.time)}</div>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="agenda-kind">Reminder</div>
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
              {busy ? "Saving..." : "Done"}
            </button>
          </div>
        </li>
      );
    }

    const { draft } = item;
    return (
      <li key={item.key} className="agenda-item" data-kind="review" data-overdue={false}>
        <div className="agenda-when">Waiting</div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="agenda-kind">Review draft</div>
            <div className="font-semibold">
              {draft.kind === "follow_up_email" ? "Follow-up message" : "Assistant answer"} for{" "}
              {draft.application.company}
            </div>
            <div className="section-subtitle">Nothing is used until you approve it.</div>
          </div>
          <Link className="app-button" href={`/applications/${draft.application.id}#assistant`}>
            Review
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
    ? "Pulling together your day..."
    : needsYou === 0
      ? "Nothing urgent. A good day to send a few more applications."
      : `${needsYou} ${needsYou === 1 ? "thing needs" : "things need"} you today${
          agenda.overdue.length > 0 ? `, ${agenda.overdue.length} overdue` : ""
        }.`;

  return (
    <PageFrame
      eyebrow={new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}
      title={
        <>
          {greeting()}
          <em>.</em>
        </>
      }
      subtitle={subtitle}
      actions={
        <Link href="/applications" className="app-button-secondary">
          Open pipeline
        </Link>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-7">
          {loading ? (
            <div className="empty-state">Loading your agenda...</div>
          ) : needsYou === 0 && agenda.soon.length === 0 ? (
            <div className="panel-card py-10 text-center">
              <div className="font-display text-2xl">All clear.</div>
              <p className="section-subtitle mt-2">
                No reminders, follow-ups, or drafts waiting. Log an application or plan a follow-up to fill this in.
              </p>
            </div>
          ) : (
            <>
              {renderGroup(
                "Overdue",
                agenda.overdue,
                true,
                overdueReminderCount > 1 ? (
                  <button
                    className="app-button-ghost"
                    onClick={clearOverdueReminders}
                    disabled={busyKey === "overdue-batch"}
                  >
                    Mark {overdueReminderCount} reminders done
                  </button>
                ) : null
              )}
              {renderGroup("Today", agenda.today, false)}
              {agenda.today.length === 0 && agenda.overdue.length === 0 ? (
                <div className="empty-state">Nothing due today.</div>
              ) : null}
              {renderGroup(`Next ${AGENDA_DAYS_AHEAD} days`, agenda.soon, false)}
              {agenda.later > 0 ? (
                <Link className="subtle-link" href="/calendar">
                  {agenda.later} more scheduled later, see the calendar
                </Link>
              ) : null}
            </>
          )}
        </div>

        <aside className="space-y-4">
          <div className="panel-card space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="mini-stat-label">Applied today</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-5xl font-medium leading-none">
                    {todaysApps.length}
                  </span>
                  <span className="section-subtitle">of {goal}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="app-button-secondary !min-h-9 !px-3"
                  onClick={() => saveGoal(Math.max(0, goal - 1))}
                  aria-label="Lower daily goal"
                >
                  -
                </button>
                <button
                  className="app-button-secondary !min-h-9 !px-3"
                  onClick={() => saveGoal(goal + 1)}
                  aria-label="Raise daily goal"
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
                    <span className={stageBadgeClass(application.stage)}>{application.stage}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="section-subtitle">
                {goal > 0 ? `Log your first of ${goal} below.` : "No goal set for today."}
              </p>
            )}
          </div>

          <div className="panel-card space-y-3">
            <div className="section-title">Log an application</div>
            <input
              className="field-input"
              placeholder="Company"
              aria-label="Company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
            <input
              className="field-input"
              placeholder="Role"
              aria-label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="field-input"
                type="date"
                aria-label="Applied date"
                value={appDate}
                onChange={(e) => setAppDate(e.target.value)}
              />
              <button
                className="app-button"
                onClick={addApplication}
                disabled={!company.trim() || !role.trim() || submittingApplication}
              >
                {submittingApplication ? "Adding..." : "Add"}
              </button>
            </div>
          </div>

          <div className="panel-card space-y-3">
            <div className="section-title">Set a reminder</div>
            <input
              className="field-input"
              placeholder="What do you need to remember?"
              aria-label="Reminder message"
              value={remMsg}
              onChange={(e) => setRemMsg(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="field-input"
                type="date"
                aria-label="Reminder date"
                value={remDate}
                onChange={(e) => setRemDate(e.target.value)}
              />
              <input
                className="field-input"
                type="time"
                aria-label="Reminder time"
                value={remTime}
                onChange={(e) => setRemTime(e.target.value)}
              />
            </div>
            <select
              className="field-select"
              aria-label="Link to application"
              value={remAppId}
              onChange={(e) => setRemAppId(e.target.value)}
            >
              <option value="">Not linked to an application</option>
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
                {submittingReminder ? "Adding..." : "Add reminder"}
              </button>
            </div>
          </div>

          <div className="panel-card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="section-title">Notes</div>
              <span className="section-subtitle text-xs">
                {noteStatus === "saving" ? "Saving..." : noteStatus === "saved" ? "Saved" : ""}
              </span>
            </div>
            <textarea
              className="field-textarea"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="What happened today?"
            />
          </div>
        </aside>
      </div>
    </PageFrame>
  );
}
