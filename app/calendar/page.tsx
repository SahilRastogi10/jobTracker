"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

type CalendarCountsResponse = {
  appsByDate: Record<string, number>;
  remsByDate: Record<string, number>;
};

type CalendarDayResponse = {
  applications: DayApp[];
  reminders: DayReminder[];
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
  const todayStr = localYYYYMMDD();
  const todayDate = useMemo(() => {
    const [y, m, d] = todayStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [todayStr]);

  const [year, setYear] = useState(todayDate.getFullYear());
  const [monthIndex, setMonthIndex] = useState(todayDate.getMonth());

  const [appsByDate, setAppsByDate] = useState<Record<string, number>>({});
  const [remsByDate, setRemsByDate] = useState<Record<string, number>>({});
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const [dayApps, setDayApps] = useState<DayApp[]>([]);
  const [dayRems, setDayRems] = useState<DayReminder[]>([]);

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
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [year, monthIndex]);

  async function loadCounts() {
    setCountsLoading(true);

    try {
      const data = await requestJson<CalendarCountsResponse>(
        `/api/calendar?start=${monthStart}&end=${monthEnd}`
      );
      setAppsByDate(data.appsByDate ?? {});
      setRemsByDate(data.remsByDate ?? {});
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Could not load month counts."));
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
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Could not load date details."));
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
      setError(getErrorMessage(toggleError, "Could not update reminder."));
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
      title="Calendar"
      subtitle="Scan monthly activity, click into a day, and resolve reminders without leaving the schedule view."
      actions={countsLoading ? <div className="badge badge-neutral">Loading...</div> : null}
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button className="app-button-secondary" onClick={prevMonth}>
            Prev
          </button>

          <div className="text-center">
            <div className="section-title">{monthLabel}</div>
            <div className="section-subtitle">Applications and reminders by day</div>
          </div>

          <button className="app-button-secondary" onClick={nextMonth}>
            Next
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 text-sm">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
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
            const isSelected = cell.dateStr === selectedDate;
            const isToday = cell.dateStr === todayStr;

            return (
              <button
                key={idx}
                className={`min-h-[110px] rounded-[1.3rem] border p-3 text-left transition ${
                  isSelected
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
                    : "border-[color:var(--line)] bg-[color:var(--paper-strong)]"
                }`}
                onClick={() => setSelectedDate(cell.dateStr!)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{cell.dayNum}</div>
                  {isToday ? <div className="badge badge-offer">today</div> : null}
                </div>

                <div className="mt-3 space-y-2">
                  <div className="badge badge-neutral">Apps {aCount}</div>
                  <div className="badge badge-neutral">Rem {rCount}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Selected date: {selectedDate}</h2>
            <p className="section-subtitle">
              Drill into the day and mark reminders complete right here.
            </p>
          </div>
          {dayLoading ? <div className="badge badge-neutral">Loading...</div> : null}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <div className="section-title">Applications</div>
            {dayLoading && dayApps.length === 0 ? (
              <div className="empty-state">Loading applications...</div>
            ) : dayApps.length === 0 ? (
              <div className="empty-state">No applications.</div>
            ) : (
              <ul className="space-y-3">
                {dayApps.map((application) => (
                  <li key={application.id} className="list-card">
                    <div className="space-y-2">
                      <div className="font-semibold">{application.company}</div>
                      <div className="section-subtitle">{application.role}</div>
                      <div className="badge badge-neutral">{application.stage}</div>
                      <Link className="subtle-link" href={`/applications/${application.id}`}>
                        Edit
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <div className="section-title">Reminders</div>
            {dayLoading && dayRems.length === 0 ? (
              <div className="empty-state">Loading reminders...</div>
            ) : dayRems.length === 0 ? (
              <div className="empty-state">No reminders.</div>
            ) : (
              <ul className="space-y-3">
                {dayRems.map((reminder) => (
                  <li key={reminder.id} className="list-card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <span className="badge badge-neutral">{reminder.time}</span>
                          {reminder.done ? <span className="badge badge-offer">done</span> : null}
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
                          <div className="section-subtitle">No linked application</div>
                        )}
                      </div>

                      <button
                        className="app-button-secondary"
                        onClick={() => toggleReminder(reminder.id, !reminder.done)}
                        disabled={busyReminderId === reminder.id}
                      >
                        {busyReminderId === reminder.id
                          ? "Saving..."
                          : reminder.done
                            ? "Undo"
                            : "Done"}
                      </button>
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
