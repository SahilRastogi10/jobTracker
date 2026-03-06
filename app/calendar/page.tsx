"use client";

import { useEffect, useMemo, useState } from "react";
import { localYYYYMMDD } from "@/src/lib/localDate";

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

export default function CalendarPage() {
  const todayStr = localYYYYMMDD();
  const todayDate = useMemo(() => {
    const [y, m, d] = todayStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [todayStr]);

  const [year, setYear] = useState(todayDate.getFullYear());
  const [monthIndex, setMonthIndex] = useState(todayDate.getMonth()); // 0-11

  const [appsByDate, setAppsByDate] = useState<Record<string, number>>({});
  const [remsByDate, setRemsByDate] = useState<Record<string, number>>({});
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const [dayApps, setDayApps] = useState<DayApp[]>([]);
  const [dayRems, setDayRems] = useState<DayReminder[]>([]);

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
    const res = await fetch(`/api/calendar?start=${monthStart}&end=${monthEnd}`);
    const data = await res.json();
    setAppsByDate(data.appsByDate ?? {});
    setRemsByDate(data.remsByDate ?? {});
  }

  async function loadDay(dateStr: string) {
    const res = await fetch(
      `/api/calendar/day?date=${encodeURIComponent(dateStr)}`
    );
    const data = await res.json();
    setDayApps(data.applications ?? []);
    setDayRems(data.reminders ?? []);
  }

  useEffect(() => {
    loadCounts();
    const defaultSelected =
      monthStart <= todayStr && todayStr <= monthEnd ? todayStr : monthStart;
    setSelectedDate(defaultSelected);
  }, [monthStart, monthEnd, todayStr]);

  useEffect(() => {
    if (!selectedDate) return;
    loadDay(selectedDate);
  }, [selectedDate]);

  const days = useMemo(() => {
    const first = firstDayOfMonth(year, monthIndex);
    const last = lastDayOfMonth(year, monthIndex);

    const firstDow = first.getDay(); // 0 Sun
    const totalDays = last.getDate();

    const cells: Array<{ dateStr: string | null; dayNum: number | null }> = [];

    for (let i = 0; i < firstDow; i++) cells.push({ dateStr: null, dayNum: null });

    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, monthIndex, day);
      cells.push({ dateStr: ymd(d), dayNum: day });
    }

    while (cells.length % 7 !== 0) cells.push({ dateStr: null, dayNum: null });

    return cells;
  }, [year, monthIndex]);

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
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <a className="underline text-sm" href="/">
          Home
        </a>
      </div>

      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button className="border rounded px-3 py-2" onClick={prevMonth}>
            Prev
          </button>

          <div className="font-medium">{monthLabel}</div>

          <button className="border rounded px-3 py-2" onClick={nextMonth}>
            Next
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 text-sm">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="opacity-70 text-center">
              {d}
            </div>
          ))}

          {days.map((cell, idx) => {
            if (!cell.dateStr) {
              return <div key={idx} className="border rounded h-20 opacity-30" />;
            }

            const aCount = appsByDate[cell.dateStr] ?? 0;
            const rCount = remsByDate[cell.dateStr] ?? 0;
            const isSelected = cell.dateStr === selectedDate;
            const isToday = cell.dateStr === todayStr;

            return (
              <button
                key={idx}
                className={`border rounded h-20 p-2 text-left ${
                  isSelected ? "bg-black/5" : ""
                }`}
                onClick={() => setSelectedDate(cell.dateStr!)}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{cell.dayNum}</div>
                  {isToday ? <div className="text-xs opacity-70">today</div> : null}
                </div>

                <div className="mt-1 space-y-1">
                  <div className="text-xs opacity-80">Apps: {aCount}</div>
                  <div className="text-xs opacity-80">Rem: {rCount}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="border rounded p-4 space-y-4">
        <div className="font-medium">Selected date: {selectedDate}</div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="font-medium">Applications</div>
            {dayApps.length === 0 ? (
              <div className="text-sm opacity-70">No applications.</div>
            ) : (
              <ul className="space-y-2">
                {dayApps.map((a) => (
                  <li key={a.id} className="border rounded p-3">
                    <div className="font-medium">{a.company}</div>
                    <div className="opacity-80">{a.role}</div>
                    <div className="text-sm opacity-70">Stage: {a.stage}</div>
                    <a className="underline text-sm" href={`/applications/${a.id}`}>
                      Edit
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <div className="font-medium">Reminders</div>
            {dayRems.length === 0 ? (
              <div className="text-sm opacity-70">No reminders.</div>
            ) : (
              <ul className="space-y-2">
                {dayRems.map((r) => (
                  <li key={r.id} className="border rounded p-3 space-y-1">
                    <div className="font-medium">
                      {r.time} {r.done ? "(done)" : ""}
                    </div>
                    <div className="opacity-80">{r.message}</div>
                    {r.application ? (
                      <a
                        className="underline text-sm"
                        href={`/applications/${r.application.id}`}
                      >
                        {r.application.company} | {r.application.role}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}