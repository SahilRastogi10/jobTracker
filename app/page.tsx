"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  applicationId?: string | null;
  application?: { id: string; company: string; role: string } | null;
};

type FollowUp = {
  id: string;
  company: string;
  role: string;
  stage: string;
  followUpDate: string;
  hasReminder: boolean;
};

type TodayResponse = {
  goal: { targetCount: number };
  note: { text: string };
  todaysApps: Application[];
  todaysReminders: Reminder[];
};

type ReminderListResponse = {
  items: Reminder[];
};

type FollowUpListResponse = {
  items: FollowUp[];
};

type AppsLiteResponse = {
  items: AppLite[];
};

const UPCOMING_LIMIT_OPTIONS = [
  { value: "20", label: "20" },
  { value: "50", label: "50" },
  { value: "all", label: "All" },
] as const;

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

async function readJson(res: Response) {
  const text = await res.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await readJson(res);

  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "Request failed."
    );
  }

  return data as T;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function HomePage() {
  const [today] = useState(localYYYYMMDD());
  const [goal, setGoal] = useState(5);
  const [note, setNote] = useState("");
  const [apps, setApps] = useState<Application[]>([]);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [appDate, setAppDate] = useState(today);

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [remTime, setRemTime] = useState("09:00");
  const [remMsg, setRemMsg] = useState("");
  const [appsLite, setAppsLite] = useState<AppLite[]>([]);
  const [remAppId, setRemAppId] = useState("");

  const [overdue, setOverdue] = useState<Reminder[]>([]);
  const [upcoming, setUpcoming] = useState<Reminder[]>([]);
  const [overdueFollowUps, setOverdueFollowUps] = useState<FollowUp[]>([]);
  const [upcomingFollowUps, setUpcomingFollowUps] = useState<FollowUp[]>([]);

  const [upcomingLimit, setUpcomingLimit] = useState("20");

  const [todayLoading, setTodayLoading] = useState(true);
  const [reminderOverviewLoading, setReminderOverviewLoading] = useState(true);
  const [followUpsLoading, setFollowUpsLoading] = useState(true);
  const [appsLiteLoading, setAppsLiteLoading] = useState(true);

  const [savingGoal, setSavingGoal] = useState(false);
  const [submittingApplication, setSubmittingApplication] = useState(false);
  const [submittingReminder, setSubmittingReminder] = useState(false);
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [busyReminderId, setBusyReminderId] = useState<string | null>(null);
  const [batchBusyKey, setBatchBusyKey] = useState<"overdue" | "today" | null>(
    null
  );
  const [followUpBusyKey, setFollowUpBusyKey] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const saveTimer = useRef<number | null>(null);

  const completedCount = apps.length;
  const remaining = useMemo(
    () => Math.max(0, goal - completedCount),
    [goal, completedCount]
  );

  async function loadTodayData() {
    setTodayLoading(true);

    try {
      const data = await requestJson<TodayResponse>("/api/today");
      setGoal(data.goal.targetCount);
      setNote(data.note.text);
      setApps(data.todaysApps ?? []);
      setReminders(data.todaysReminders ?? []);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Could not load today's dashboard."));
    } finally {
      setTodayLoading(false);
    }
  }

  async function loadAppsLite() {
    setAppsLiteLoading(true);

    try {
      const data = await requestJson<AppsLiteResponse>("/api/applications/simple");
      setAppsLite(data.items ?? []);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Could not load applications."));
    } finally {
      setAppsLiteLoading(false);
    }
  }

  async function loadReminderOverview() {
    setReminderOverviewLoading(true);

    try {
      const upcomingParams = new URLSearchParams();
      if (upcomingLimit !== "all") {
        upcomingParams.set("limit", upcomingLimit);
      }

      const upcomingUrl = upcomingParams.size
        ? `/api/reminders/upcoming?${upcomingParams.toString()}`
        : "/api/reminders/upcoming";

      const [overdueData, upcomingData] = await Promise.all([
        requestJson<ReminderListResponse>("/api/reminders/overdue"),
        requestJson<ReminderListResponse>(upcomingUrl),
      ]);

      setOverdue(overdueData.items ?? []);
      setUpcoming(upcomingData.items ?? []);
    } catch (loadError) {
      setError(
        getErrorMessage(loadError, "Could not load reminder overview lists.")
      );
    } finally {
      setReminderOverviewLoading(false);
    }
  }

  async function loadFollowUps() {
    setFollowUpsLoading(true);

    try {
      const [overdueData, upcomingData] = await Promise.all([
        requestJson<FollowUpListResponse>("/api/followups/overdue"),
        requestJson<FollowUpListResponse>("/api/followups/upcoming"),
      ]);

      setOverdueFollowUps(overdueData.items ?? []);
      setUpcomingFollowUps(upcomingData.items ?? []);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Could not load follow-up lists."));
    } finally {
      setFollowUpsLoading(false);
    }
  }

  useEffect(() => {
    setError(null);
    void loadTodayData();
    void loadAppsLite();
    void loadFollowUps();
  }, []);

  useEffect(() => {
    setError(null);
    void loadReminderOverview();
  }, [upcomingLimit]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, []);

  async function addReminder() {
    setError(null);
    setSubmittingReminder(true);

    try {
      await requestJson("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          time: remTime,
          message: remMsg,
          applicationId: remAppId || null,
        }),
      });

      setRemMsg("");
      setRemAppId("");

      await Promise.all([loadTodayData(), loadReminderOverview(), loadFollowUps()]);
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Could not add reminder."));
    } finally {
      setSubmittingReminder(false);
    }
  }

  async function toggleReminder(id: string, done: boolean) {
    setError(null);
    setBusyReminderId(id);

    try {
      await requestJson(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });

      await Promise.all([loadTodayData(), loadReminderOverview()]);
    } catch (toggleError) {
      setError(getErrorMessage(toggleError, "Could not update reminder."));
    } finally {
      setBusyReminderId(null);
    }
  }

  async function markAllDone(
    ids: string[],
    key: "overdue" | "today"
  ) {
    if (ids.length === 0) return;

    setError(null);
    setBatchBusyKey(key);

    try {
      await requestJson("/api/reminders/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, done: true }),
      });

      await Promise.all([loadTodayData(), loadReminderOverview()]);
    } catch (batchError) {
      setError(getErrorMessage(batchError, "Could not mark reminders done."));
    } finally {
      setBatchBusyKey(null);
    }
  }

  async function addApplication() {
    setError(null);
    setSubmittingApplication(true);

    try {
      await requestJson("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, role, dateApplied: appDate }),
      });

      setCompany("");
      setRole("");
      setAppDate(today);

      await Promise.all([loadTodayData(), loadAppsLite()]);
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Could not add application."));
    } finally {
      setSubmittingApplication(false);
    }
  }

  async function saveGoal(nextGoal: number) {
    if (!Number.isFinite(nextGoal)) return;

    setError(null);
    setSavingGoal(true);
    setGoal(nextGoal);

    try {
      await requestJson("/api/goal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCount: nextGoal }),
      });
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Could not save daily goal."));
    } finally {
      setSavingGoal(false);
    }
  }

  function onNoteChange(next: string) {
    setError(null);
    setNote(next);
    setNoteStatus("saving");

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }

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

  async function createReminderForFollowUp(followUp: FollowUp) {
    const busyKey = `${followUp.id}:${followUp.followUpDate}`;

    setError(null);
    setFollowUpBusyKey(busyKey);

    try {
      const existsData = await requestJson<{ exists: boolean }>(
        `/api/reminders/exists?applicationId=${encodeURIComponent(
          followUp.id
        )}&date=${encodeURIComponent(followUp.followUpDate)}`
      );

      if (!existsData.exists) {
        await requestJson("/api/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: followUp.followUpDate,
            time: "09:00",
            message: `Follow up: ${followUp.company} | ${followUp.role}`,
            applicationId: followUp.id,
          }),
        });
      }

      await Promise.all([loadTodayData(), loadReminderOverview(), loadFollowUps()]);
    } catch (createError) {
      setError(
        getErrorMessage(createError, "Could not create follow-up reminder.")
      );
    } finally {
      setFollowUpBusyKey(null);
    }
  }

  return (
    <PageFrame
      title="Daily dashboard"
      subtitle="Log applications, stay ahead of reminders, and keep your search moving with a calmer, higher-signal view."
      eyebrow={`Today ${today}`}
      actions={
        <>
          <div className="badge badge-neutral">
            {todayLoading ? "Refreshing..." : `${apps.length} applications today`}
          </div>
          <Link href="/applications" className="app-button-secondary">
            View pipeline
          </Link>
        </>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="mini-stat">
          <div className="mini-stat-label">Daily goal</div>
          <div className="mini-stat-value">{goal}</div>
        </div>
        <div className="mini-stat">
          <div className="mini-stat-label">Completed today</div>
          <div className="mini-stat-value">{completedCount}</div>
        </div>
        <div className="mini-stat">
          <div className="mini-stat-label">Remaining</div>
          <div className="mini-stat-value">{remaining}</div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="panel-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">Daily goal</h2>
              <p className="section-subtitle">
                Adjust today&apos;s target and keep the dashboard synced.
              </p>
            </div>
            <div className="badge badge-neutral">{savingGoal ? "Saving..." : "Live sync"}</div>
          </div>

          <div className="max-w-[220px]">
            <label className="field-label" htmlFor="goal">
              Applications target
            </label>
            <input
              id="goal"
              className="field-input"
              type="number"
              min={0}
              max={500}
              value={goal}
              onChange={(e) => saveGoal(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="panel-card space-y-4">
          <div>
            <h2 className="section-title">Add application</h2>
            <p className="section-subtitle">
              Capture a new role quickly without leaving the dashboard.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="field-label" htmlFor="app-date">
                Applied date
              </label>
              <input
                id="app-date"
                className="field-input"
                type="date"
                value={appDate}
                onChange={(e) => setAppDate(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="company">
                Company
              </label>
              <input
                id="company"
                className="field-input"
                placeholder="Company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="role">
                Role
              </label>
              <input
                id="role"
                className="field-input"
                placeholder="Role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              className="app-button"
              onClick={addApplication}
              disabled={!company.trim() || !role.trim() || submittingApplication}
            >
              {submittingApplication ? "Adding..." : "Add application"}
            </button>
          </div>
        </div>
      </section>

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Today applications</h2>
          {todayLoading ? (
            <div className="text-sm opacity-70">Loading...</div>
          ) : null}
        </div>

        {todayLoading && apps.length === 0 ? (
          <div className="opacity-70">Loading today's applications...</div>
        ) : apps.length === 0 ? (
          <div className="opacity-70">No applications yet.</div>
        ) : (
          <ul className="space-y-2">
            {apps.map((application) => (
              <li key={application.id} className="list-card">
                <div className="font-medium">{application.company}</div>
                <div className="section-subtitle">{application.role}</div>
                <div className={stageBadgeClass(application.stage)}>
                  {application.stage}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="section-title">Overdue reminders</h2>
            {reminderOverviewLoading ? (
              <div className="text-sm opacity-70">Loading...</div>
            ) : null}
          </div>

          {overdue.length > 0 ? (
            <button
              className="app-button-secondary"
              onClick={() =>
                markAllDone(
                  overdue.map((reminder) => reminder.id),
                  "overdue"
                )
              }
              disabled={batchBusyKey === "overdue"}
            >
              {batchBusyKey === "overdue" ? "Marking..." : "Mark all done"}
            </button>
          ) : null}
        </div>

        {reminderOverviewLoading && overdue.length === 0 ? (
          <div className="opacity-70">Loading overdue reminders...</div>
        ) : overdue.length === 0 ? (
          <div className="opacity-70">None.</div>
        ) : (
          <ul className="space-y-2">
            {overdue.map((reminder) => (
              <li
                key={reminder.id}
                className="list-card flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="font-medium">
                    {reminder.date} {reminder.time}
                  </div>
                  <div className="opacity-80">{reminder.message}</div>
                  {reminder.application ? (
                    <a
                      className="subtle-link"
                      href={`/applications/${reminder.application.id}`}
                    >
                      {reminder.application.company} | {reminder.application.role}
                    </a>
                  ) : null}
                </div>
                <button
                  className="app-button"
                  onClick={() => toggleReminder(reminder.id, true)}
                  disabled={busyReminderId === reminder.id}
                >
                  {busyReminderId === reminder.id ? "Saving..." : "Done"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="section-title">Upcoming reminders</h2>
            {reminderOverviewLoading ? (
              <div className="text-sm opacity-70">Loading...</div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <label className="field-label mb-0" htmlFor="upcoming-limit">
              Show
            </label>
            <select
              id="upcoming-limit"
              className="field-select min-w-[110px]"
              value={upcomingLimit}
              onChange={(e) => setUpcomingLimit(e.target.value)}
            >
              {UPCOMING_LIMIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {reminderOverviewLoading && upcoming.length === 0 ? (
          <div className="opacity-70">Loading upcoming reminders...</div>
        ) : upcoming.length === 0 ? (
          <div className="opacity-70">None.</div>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((reminder) => (
              <li
                key={reminder.id}
                className="list-card flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="font-medium">
                    {reminder.date} {reminder.time}
                  </div>
                  <div className="opacity-80">{reminder.message}</div>
                  {reminder.application ? (
                    <a
                      className="subtle-link"
                      href={`/applications/${reminder.application.id}`}
                    >
                      {reminder.application.company} | {reminder.application.role}
                    </a>
                  ) : null}
                </div>
                <button
                  className="app-button-secondary"
                  onClick={() => toggleReminder(reminder.id, true)}
                  disabled={busyReminderId === reminder.id}
                >
                  {busyReminderId === reminder.id ? "Saving..." : "Done"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="section-title">Today reminders</h2>
            {todayLoading ? <div className="text-sm opacity-70">Loading...</div> : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {reminders.length > 0 ? (
              <button
                className="app-button-secondary"
                onClick={() =>
                  markAllDone(
                    reminders.map((reminder) => reminder.id),
                    "today"
                  )
                }
                disabled={batchBusyKey === "today"}
              >
                {batchBusyKey === "today" ? "Marking..." : "Mark all done"}
              </button>
            ) : null}

            <Link className="app-button-ghost" href="/reminders">
              Open reminders
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <label className="field-label">Time</label>
            <input
              type="time"
              className="field-input"
              value={remTime}
              onChange={(e) => setRemTime(e.target.value)}
            />
          </div>

          <div className="grid min-w-[240px] flex-1 gap-1">
            <label className="field-label">Message</label>
            <input
              className="field-input"
              value={remMsg}
              onChange={(e) => setRemMsg(e.target.value)}
              placeholder="Follow up with recruiter"
            />
          </div>

          <div className="grid min-w-[260px] gap-1">
            <label className="field-label">Link to application</label>
            <select
              className="field-select"
              value={remAppId}
              onChange={(e) => setRemAppId(e.target.value)}
              disabled={appsLiteLoading}
            >
              <option value="">None</option>
              {appsLite.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.company} | {application.role}
                </option>
              ))}
            </select>
          </div>

          <button
            className="app-button"
            onClick={addReminder}
            disabled={!remMsg.trim() || submittingReminder}
          >
            {submittingReminder ? "Adding..." : "Add"}
          </button>
        </div>

        {todayLoading && reminders.length === 0 ? (
          <div className="opacity-70">Loading today's reminders...</div>
        ) : reminders.length === 0 ? (
          <div className="opacity-70">No reminders today.</div>
        ) : (
          <ul className="space-y-2">
            {reminders.map((reminder) => (
              <li
                key={reminder.id}
                className="list-card flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="font-medium">{reminder.time}</div>
                  <div className="opacity-80">{reminder.message}</div>
                  {reminder.application ? (
                    <a
                      className="subtle-link"
                      href={`/applications/${reminder.application.id}`}
                    >
                      {reminder.application.company} | {reminder.application.role}
                    </a>
                  ) : null}
                </div>
                <button
                  className="app-button-secondary"
                  onClick={() => toggleReminder(reminder.id, true)}
                  disabled={busyReminderId === reminder.id}
                >
                  {busyReminderId === reminder.id ? "Saving..." : "Done"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Overdue follow-ups</h2>
          {followUpsLoading ? (
            <div className="text-sm opacity-70">Loading...</div>
          ) : null}
        </div>

        {followUpsLoading && overdueFollowUps.length === 0 ? (
          <div className="opacity-70">Loading overdue follow-ups...</div>
        ) : overdueFollowUps.length === 0 ? (
          <div className="opacity-70">None.</div>
        ) : (
          <ul className="space-y-2">
            {overdueFollowUps.map((followUp) => {
              const busyKey = `${followUp.id}:${followUp.followUpDate}`;

              return (
                <li
                  key={busyKey}
                  className="list-card flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="font-medium">
                      {followUp.followUpDate} | {followUp.company}
                    </div>
                    <div className="section-subtitle">{followUp.role}</div>
                    <div className={stageBadgeClass(followUp.stage)}>{followUp.stage}</div>
                    <Link className="subtle-link" href={`/applications/${followUp.id}`}>
                      Edit application
                    </Link>
                  </div>

                  {followUp.hasReminder ? (
                    <div className="text-sm opacity-70">Reminder exists</div>
                  ) : (
                    <button
                      className="app-button"
                      onClick={() => createReminderForFollowUp(followUp)}
                      disabled={followUpBusyKey === busyKey}
                    >
                      {followUpBusyKey === busyKey
                        ? "Creating..."
                        : "Create reminder"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Upcoming follow-ups</h2>
          {followUpsLoading ? (
            <div className="text-sm opacity-70">Loading...</div>
          ) : null}
        </div>

        {followUpsLoading && upcomingFollowUps.length === 0 ? (
          <div className="opacity-70">Loading upcoming follow-ups...</div>
        ) : upcomingFollowUps.length === 0 ? (
          <div className="opacity-70">None.</div>
        ) : (
          <ul className="space-y-2">
            {upcomingFollowUps.map((followUp) => {
              const busyKey = `${followUp.id}:${followUp.followUpDate}`;

              return (
                <li
                  key={busyKey}
                  className="list-card flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="font-medium">
                      {followUp.followUpDate} | {followUp.company}
                    </div>
                    <div className="section-subtitle">{followUp.role}</div>
                    <div className={stageBadgeClass(followUp.stage)}>{followUp.stage}</div>
                    <Link className="subtle-link" href={`/applications/${followUp.id}`}>
                      Edit application
                    </Link>
                  </div>

                  {followUp.hasReminder ? (
                    <div className="text-sm opacity-70">Reminder exists</div>
                  ) : (
                    <button
                      className="app-button-secondary"
                      onClick={() => createReminderForFollowUp(followUp)}
                      disabled={followUpBusyKey === busyKey}
                    >
                      {followUpBusyKey === busyKey
                        ? "Creating..."
                        : "Create reminder"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel-card space-y-4">
        <h2 className="section-title">Daily notes</h2>
        <textarea
          className="field-textarea"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="What happened today?"
        />
        <div className="text-sm opacity-70">
          {noteStatus === "saving"
            ? "Saving..."
            : noteStatus === "saved"
              ? "Saved."
              : "Auto saves after you stop typing."}
        </div>
      </section>
    </PageFrame>
  );
}
