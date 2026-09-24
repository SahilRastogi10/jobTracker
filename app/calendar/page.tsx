"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import { PageFrame } from "@/components/PageFrame";
import { localYYYYMMDD } from "@/lib/localDate";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function firstDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1);
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0);
}

type DayApp = {
  id: string;
  company: string;
  role: string;
  stage: string;
  dateApplied: string;
};

type DayReminder = {
  id: string;
  date: string;
  time: string;
  message: string;
  done: boolean;
  application?: { id: string; company: string; role: string } | null;
};

type DayFollowUp = {
  id: string;
  dueDate: string;
  channel: string;
  status: string;
  application: { id: string; company: string; role: string };
  recruiter?: { name?: string | null; email?: string | null } | null;
};

type CalendarCountsResponse = {
  appsByDate: Record<string, number>;
  remsByDate: Record<string, number>;
  followUpsByDate: Record<string, number>;
};

type CalendarDayResponse = {
  applications: DayApp[];
  reminders: DayReminder[];
  followUps: DayFollowUp[];
};

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

export default function CalendarPage() {
  const { t, tValue, dateLocale } = useI18n();
  const todayStr = localYYYYMMDD();
  const todayDate = useMemo(() => {
    const [y, m, d] = todayStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [todayStr]);

  const [year, setYear] = useState(todayDate.getFullYear());
  const [monthIndex, setMonthIndex] = useState(todayDate.getMonth());

  const [appsByDate, setAppsByDate] = useState<Record<string, number>>({});
  const [remsByDate, setRemsByDate] = useState<Record<string, number>>({});
  const [followUpsByDate, setFollowUpsByDate] = useState<Record<string, number>>({});
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const [dayApps, setDayApps] = useState<DayApp[]>([]);
  const [dayRems, setDayRems] = useState<DayReminder[]>([]);
  const [dayFollowUps, setDayFollowUps] = useState<DayFollowUp[]>([]);

  const [countsLoading, setCountsLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(true);
  const [busyReminderId, setBusyReminderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const monthStart = useMemo(
    () => ymd(firstDayOfMonth(year, monthIndex)),
    [year, monthIndex]
  );
  const monthEnd = useMemo(
    () => ymd(lastDayOfMonth(year, monthIndex)),
    [year, monthIndex]
  );

  const monthLabel = useMemo(() => {
    const d = new Date(year, monthIndex, 1);
    return d.toLocaleString(dateLocale, { month: "long", year: "numeric" });
  }, [year, monthIndex, dateLocale]);

  // 2023-01-01 was a Sunday, so these are Sun..Sat in the active language.
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Date(2023, 0, 1 + index).toLocaleDateString(dateLocale, { weekday: "short" })
      ),
    [dateLocale]
  );

  async function loadCounts() {
    setCountsLoading(true);

    try {
      const data = await requestJson<CalendarCountsResponse>(
        `/api/calendar?start=${monthStart}&end=${monthEnd}`
      );
      setAppsByDate(data.appsByDate ?? {});
      setRemsByDate(data.remsByDate ?? {});
      setFollowUpsByDate(data.followUpsByDate ?? {});
    } catch (loadError) {
      setError(getErrorMessage(loadError, t("calendar.errCounts")));
    } finally {
      setCountsLoading(false);
    }
  }

  async function loadDay(dateStr: string) {
    setDayLoading(true);

    try {
      const data = await requestJson<CalendarDayResponse>(
        `/api/calendar/day?date=${encodeURIComponent(dateStr)}`
      );
      setDayApps(data.applications ?? []);
      setDayRems(data.reminders ?? []);
      setDayFollowUps(data.followUps ?? []);
    } catch (loadError) {
      setError(getErrorMessage(loadError, t("calendar.errDay")));
    } finally {
      setDayLoading(false);
    }
  }

  useEffect(() => {
    setError(null);
    void loadCounts();

    const defaultSelected =
      monthStart <= todayStr && todayStr <= monthEnd ? todayStr : monthStart;
    setSelectedDate(defaultSelected);
  }, [monthStart, monthEnd, todayStr]);

  useEffect(() => {
    if (!selectedDate) return;

    setError(null);
    void loadDay(selectedDate);
    // Reload on data changes only; switching language needs no refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const days = useMemo(() => {
    const first = firstDayOfMonth(year, monthIndex);
    const last = lastDayOfMonth(year, monthIndex);
    const firstDow = first.getDay();
    const totalDays = last.getDate();

    const cells: Array<{ dateStr: string | null; dayNum: number | null }> = [];

    for (let i = 0; i < firstDow; i++) {
      cells.push({ dateStr: null, dayNum: null });
    }

    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, monthIndex, day);
      cells.push({ dateStr: ymd(d), dayNum: day });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ dateStr: null, dayNum: null });
    }

    return cells;
  }, [year, monthIndex]);

  async function toggleReminder(id: string, done: boolean) {
    setError(null);
    setBusyReminderId(id);

    try {
      await requestJson(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });

      await loadDay(selectedDate);
    } catch (toggleError) {
      setError(getErrorMessage(toggleError, t("calendar.errReminder")));
    } finally {
      setBusyReminderId(null);
    }
  }

  function prevMonth() {
    const d = new Date(year, monthIndex - 1, 1);
    setYear(d.getFullYear());
    setMonthIndex(d.getMonth());
  }

  function nextMonth() {
    const d = new Date(year, monthIndex + 1, 1);
    setYear(d.getFullYear());
    setMonthIndex(d.getMonth());
  }

  return (
    <PageFrame
      eyebrow={t("calendar.eyebrow")}
      title={t("calendar.title")}
      subtitle={t("calendar.subtitle")}
      actions={countsLoading ? <div className="badge badge-neutral">{t("common.loading")}</div> : null}
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button className="app-button-secondary" onClick={prevMonth}>
            {t("calendar.prev")}
          </button>

          <div className="text-center">
            <div className="section-title">{monthLabel}</div>
            <div className="section-subtitle">{t("calendar.byDay")}</div>
          </div>

          <button className="app-button-secondary" onClick={nextMonth}>
            {t("calendar.next")}
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 text-sm">
          {weekdayLabels.map((day) => (
            <div key={day} className="py-2 text-center font-semibold text-[color:var(--muted)]">
              {day}
            </div>
          ))}

          {days.map((cell, idx) => {
            if (!cell.dateStr) {
              return (
                <div
                  key={idx}
                  className="min-h-[110px] rounded-[1.2rem] border border-[color:var(--line)]/60 opacity-30"
                />
              );
            }

            const aCount = appsByDate[cell.dateStr] ?? 0;
            const rCount = remsByDate[cell.dateStr] ?? 0;
            const fCount = followUpsByDate[cell.dateStr] ?? 0;
            const isSelected = cell.dateStr === selectedDate;
            const isToday = cell.dateStr === todayStr;

            return (
              <button
                key={idx}
                className={`flex min-h-[96px] flex-col justify-start rounded-[10px] border p-2.5 text-left transition hover:border-[color:var(--ink)] ${
                  isSelected
                    ? "border-[color:var(--ink)] bg-[color:var(--paper-sunk)]"
                    : "border-[color:var(--line)] bg-[color:var(--paper-strong)]"
                }`}
                onClick={() => setSelectedDate(cell.dateStr!)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={
                      isToday
                        ? "grid h-7 w-7 place-items-center rounded-full bg-[color:var(--accent)] font-semibold text-white"
                        : "font-semibold"
                    }
                  >
                    {cell.dayNum}
                  </div>
                </div>

                {/* Only days with activity get markers, so busy days stand out */}
                <div className="mt-2 space-y-1 text-xs font-semibold">
                  {aCount > 0 ? (
                    <div className="text-[color:var(--stage-applied)]">
                      {t("calendar.appliedCount", { count: aCount })}
                    </div>
                  ) : null}
                  {fCount > 0 ? (
                    <div className="text-[color:var(--accent)]">
                      {fCount === 1
                        ? t("calendar.followUpOne")
                        : t("calendar.followUpMany", { count: fCount })}
                    </div>
                  ) : null}
                  {rCount > 0 ? (
                    <div className="text-[color:var(--stage-interview)]">
                      {rCount === 1
                        ? t("calendar.reminderOne")
                        : t("calendar.reminderMany", { count: rCount })}
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">{t("calendar.selectedDate", { date: selectedDate })}</h2>
            <p className="section-subtitle">
              {t("calendar.drillHelp")}
            </p>
          </div>
          {dayLoading ? <div className="badge badge-neutral">{t("common.loading")}</div> : null}
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-3">
            <div className="section-title">{t("calendar.applications")}</div>
            {dayLoading && dayApps.length === 0 ? (
              <div className="empty-state">{t("calendar.loadingApplications")}</div>
            ) : dayApps.length === 0 ? (
              <div className="empty-state">{t("calendar.noApplications")}</div>
            ) : (
              <ul className="space-y-3">
                {dayApps.map((application) => (
                  <li key={application.id} className="list-card">
                    <div className="space-y-2">
                      <div className="font-semibold">{application.company}</div>
                      <div className="section-subtitle">{application.role}</div>
                      <div className={`badge badge-${application.stage}`}>
                        {tValue("stage", application.stage)}
                      </div>
                      <Link className="subtle-link" href={`/applications/${application.id}`}>
                        {t("common.edit")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <div className="section-title">{t("calendar.reminders")}</div>
            {dayLoading && dayRems.length === 0 ? (
              <div className="empty-state">{t("calendar.loadingReminders")}</div>
            ) : dayRems.length === 0 ? (
              <div className="empty-state">{t("calendar.noReminders")}</div>
            ) : (
              <ul className="space-y-3">
                {dayRems.map((reminder) => (
                  <li key={reminder.id} className="list-card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <span className="badge badge-neutral">{reminder.time}</span>
                          {reminder.done ? (
                            <span className="badge badge-offer">{t("reminders.statusDone")}</span>
                          ) : null}
                        </div>
                        <div className="font-semibold">{reminder.message}</div>
                        {reminder.application ? (
                          <Link
                            className="subtle-link"
                            href={`/applications/${reminder.application.id}`}
                          >
                            {reminder.application.company} | {reminder.application.role}
                          </Link>
                        ) : (
                          <div className="section-subtitle">{t("calendar.noLinked")}</div>
                        )}
                      </div>

                      <button
                        className="app-button-secondary"
                        onClick={() => toggleReminder(reminder.id, !reminder.done)}
                        disabled={busyReminderId === reminder.id}
                      >
                        {busyReminderId === reminder.id
                          ? t("common.saving")
                          : reminder.done
                            ? t("common.undo")
                            : t("common.done")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <div className="section-title">{t("calendar.followUps")}</div>
            {dayLoading && dayFollowUps.length === 0 ? (
              <div className="empty-state">{t("calendar.loadingFollowUps")}</div>
            ) : dayFollowUps.length === 0 ? (
              <div className="empty-state">{t("calendar.noFollowUps")}</div>
            ) : (
              <ul className="space-y-3">
                {dayFollowUps.map((followUp) => (
                  <li key={followUp.id} className="list-card">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <span className="badge badge-neutral">{tValue("channel", followUp.channel)}</span>
                        <span className="badge badge-neutral">
                          {tValue("followUpStatus", followUp.status)}
                        </span>
                      </div>
                      <div className="font-semibold">
                        {followUp.application.company} | {followUp.application.role}
                      </div>
                      {followUp.recruiter ? (
                        <div className="section-subtitle">
                          {t("calendar.to", {
                            name: followUp.recruiter.name || followUp.recruiter.email || "",
                          })}
                        </div>
                      ) : null}
                      <Link
                        className="subtle-link"
                        href={`/applications/${followUp.application.id}`}
                      >
                        {t("calendar.openApplication")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </PageFrame>
  );
}
