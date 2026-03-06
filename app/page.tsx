"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { localYYYYMMDD } from "@/src/lib/localDate";

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

  const saveTimer = useRef<number | null>(null);

  const completedCount = apps.length;
  const remaining = useMemo(
    () => Math.max(0, goal - completedCount),
    [goal, completedCount]
  );

  async function load() {
    const res = await fetch("/api/today");
    const data = await res.json();
    setGoal(data.goal.targetCount);
    setNote(data.note.text);
    setApps(data.todaysApps);
    setReminders(data.todaysReminders ?? []);
  }

  async function loadAppsLite() {
    const res = await fetch("/api/applications/simple");
    const data = await res.json();
    setAppsLite(
      (data.items ?? []).map((x: any) => ({
        id: x.id,
        company: x.company,
        role: x.role,
      }))
    );
  }

  useEffect(() => {
    load();
    loadAppsLite();
  }, []);

  async function addReminder() {
    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: today,
        time: remTime,
        message: remMsg,
        applicationId: remAppId || null,
      }),
    });
    if (!res.ok) return;
    setRemMsg("");
    setRemAppId("");
    await load();
  }

  async function toggleReminder(id: string, done: boolean) {
    await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    await load();
  }

  async function addApplication() {
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, role, dateApplied: appDate }),
    });

    if (!res.ok) return;
    setCompany("");
    setRole("");
    setAppDate(today);
    await load();
    await loadAppsLite();
  }

  async function saveGoal(nextGoal: number) {
    setGoal(nextGoal);
    await fetch("/api/goal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetCount: nextGoal }),
    });
  }

  function onNoteChange(next: string) {
    setNote(next);

    if (saveTimer.current) window.clearTimeout(saveTimer.current);

    saveTimer.current = window.setTimeout(async () => {
      await fetch("/api/note", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: next }),
      });
    }, 600);
  }

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Today: {today}</h1>
        <div className="flex gap-3 flex-wrap">
          <a className="underline text-sm" href="/applications">
            Applications
          </a>
          <a className="underline text-sm" href="/reminders">
            Reminders
          </a>
          <a className="underline text-sm" href="/calendar">
            Calendar
          </a>
        </div>
      </div>

      <section className="rounded border p-4 space-y-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="text-lg">Daily goal</div>
            <input
              className="border rounded px-2 py-1 w-24"
              type="number"
              min={0}
              max={500}
              value={goal}
              onChange={(e) => saveGoal(Number(e.target.value))}
            />
          </div>

          <div className="text-sm opacity-70">
            Done: {completedCount} | Left: {remaining}
          </div>
        </div>
      </section>

      <section className="rounded border p-4 space-y-3">
        <h2 className="text-lg font-medium">Add application</h2>
        <div className="flex gap-2 flex-col sm:flex-row">
          <input
            className="border rounded px-3 py-2"
            type="date"
            value={appDate}
            onChange={(e) => setAppDate(e.target.value)}
          />
          <input
            className="border rounded px-3 py-2 flex-1"
            placeholder="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
          <input
            className="border rounded px-3 py-2 flex-1"
            placeholder="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
          <button
            className="border rounded px-3 py-2"
            onClick={addApplication}
            disabled={!company.trim() || !role.trim()}
          >
            Add
          </button>
        </div>
      </section>

      <section className="rounded border p-4 space-y-3">
        <h2 className="text-lg font-medium">Today applications</h2>
        {apps.length === 0 ? (
          <div className="opacity-70">No applications yet.</div>
        ) : (
          <ul className="space-y-2">
            {apps.map((a) => (
              <li key={a.id} className="border rounded p-3">
                <div className="font-medium">{a.company}</div>
                <div className="opacity-80">{a.role}</div>
                <div className="text-sm opacity-70">Stage: {a.stage}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-medium">Today reminders</h2>
          <a className="underline text-sm" href="/reminders">
            Open reminders
          </a>
        </div>

        <div className="flex gap-2 flex-wrap items-end">
          <div className="grid gap-1">
            <label className="text-sm opacity-70">Time</label>
            <input
              type="time"
              className="border rounded px-3 py-2"
              value={remTime}
              onChange={(e) => setRemTime(e.target.value)}
            />
          </div>

          <div className="grid gap-1 flex-1 min-w-[240px]">
            <label className="text-sm opacity-70">Message</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={remMsg}
              onChange={(e) => setRemMsg(e.target.value)}
              placeholder="Follow up with recruiter"
            />
          </div>

          <div className="grid gap-1 min-w-[260px]">
            <label className="text-sm opacity-70">Link to application</label>
            <select
              className="border rounded px-3 py-2"
              value={remAppId}
              onChange={(e) => setRemAppId(e.target.value)}
            >
              <option value="">None</option>
              {appsLite.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.company} | {a.role}
                </option>
              ))}
            </select>
          </div>

          <button
            className="border rounded px-3 py-2"
            onClick={addReminder}
            disabled={!remMsg.trim()}
          >
            Add
          </button>
        </div>

        {reminders.length === 0 ? (
          <div className="opacity-70">No reminders today.</div>
        ) : (
          <ul className="space-y-2">
            {reminders.map((r) => (
              <li
                key={r.id}
                className="border rounded p-3 flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="font-medium">{r.time}</div>
                  <div className="opacity-80">{r.message}</div>

                  {r.application ? (
                    <a
                      className="underline text-sm"
                      href={`/applications/${r.application.id}`}
                    >
                      {r.application.company} | {r.application.role}
                    </a>
                  ) : null}
                </div>

                <button
                  className="border rounded px-2 py-1 text-sm"
                  onClick={() => toggleReminder(r.id, true)}
                >
                  Done
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded border p-4 space-y-3">
        <h2 className="text-lg font-medium">Daily notes</h2>
        <textarea
          className="border rounded w-full p-3 min-h-[140px]"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="What happened today?"
        />
        <div className="text-sm opacity-70">Auto saves after you stop typing.</div>
      </section>
    </main>
  );
}