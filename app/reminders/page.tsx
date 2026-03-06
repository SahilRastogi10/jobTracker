"use client";

import { useEffect, useState } from "react";
import { localYYYYMMDD } from "@/src/lib/localDate";

type AppLite = {
  id: string;
  company: string;
  role: string;
  stage: string;
  dateApplied: string;
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

export default function RemindersPage() {
  const [date, setDate] = useState(localYYYYMMDD());
  const [items, setItems] = useState<Reminder[]>([]);
  const [apps, setApps] = useState<AppLite[]>([]);

  const [time, setTime] = useState("09:00");
  const [message, setMessage] = useState("");
  const [applicationId, setApplicationId] = useState<string>("");

  async function loadApps() {
    const res = await fetch("/api/applications/simple");
    const data = await res.json();
    setApps(data.items ?? []);
  }

  async function loadReminders(d = date) {
    const res = await fetch(`/api/reminders?date=${encodeURIComponent(d)}`);
    const data = await res.json();
    setItems(data.items ?? []);
  }

  useEffect(() => {
    loadApps();
  }, []);

  useEffect(() => {
    loadReminders(date);
  }, [date]);

  async function add() {
    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        time,
        message,
        applicationId: applicationId || null,
      }),
    });
    if (!res.ok) return;

    setMessage("");
    setApplicationId("");
    await loadReminders(date);
  }

  async function toggle(id: string, done: boolean) {
    await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    await loadReminders(date);
  }

  async function remove(id: string) {
    await fetch(`/api/reminders/${id}`, { method: "DELETE" });
    await loadReminders(date);
  }

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Reminders</h1>
        <a className="underline text-sm" href="/">
          Home
        </a>
      </div>

      <section className="border rounded p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-end">
          <div className="grid gap-1">
            <label className="text-sm opacity-70">Date</label>
            <input
              type="date"
              className="border rounded px-3 py-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm opacity-70">Time</label>
            <input
              type="time"
              className="border rounded px-3 py-2"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          <div className="grid gap-1 flex-1 min-w-[220px]">
            <label className="text-sm opacity-70">Message</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Follow up with recruiter"
            />
          </div>

          <div className="grid gap-1 min-w-[260px]">
            <label className="text-sm opacity-70">Link to application (optional)</label>
            <select
              className="border rounded px-3 py-2"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
            >
              <option value="">None</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.company} | {a.role}
                </option>
              ))}
            </select>
          </div>

          <button
            className="border rounded px-3 py-2"
            onClick={add}
            disabled={!message.trim()}
          >
            Add
          </button>
        </div>
      </section>

      <section className="border rounded p-4 space-y-2">
        {items.length === 0 ? (
          <div className="opacity-70">No reminders for this date.</div>
        ) : (
          <ul className="space-y-2">
            {items.map((r) => (
              <li key={r.id} className="border rounded p-3 space-y-2">
  <div className="flex items-start justify-between gap-3">
    <div className="space-y-1 flex-1">
      <div className="text-sm opacity-70">Time</div>
      <input
        className="border rounded px-2 py-1 w-32"
        type="time"
        value={r.time}
        onChange={async (e) => {
          const nextTime = e.target.value;
          setItems((prev) =>
            prev.map((x) => (x.id === r.id ? { ...x, time: nextTime } : x))
          );
        }}
        onBlur={async () => {
          await fetch(`/api/reminders/${r.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ time: r.time }),
          });
          await loadReminders(date);
        }}
      />

      <div className="text-sm opacity-70 mt-2">Message</div>
      <input
        className="border rounded px-2 py-1 w-full"
        value={r.message}
        onChange={(e) => {
          const nextMsg = e.target.value;
          setItems((prev) =>
            prev.map((x) => (x.id === r.id ? { ...x, message: nextMsg } : x))
          );
        }}
        onBlur={async () => {
          await fetch(`/api/reminders/${r.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: r.message }),
          });
          await loadReminders(date);
        }}
      />

      {r.application ? (
        <a className="underline text-sm" href={`/applications/${r.application.id}`}>
          {r.application.company} | {r.application.role}
        </a>
      ) : null}
    </div>

    <div className="flex gap-2">
      <button
        className="border rounded px-2 py-1 text-sm"
        onClick={async () => {
          await toggle(r.id, !r.done);
        }}
      >
        {r.done ? "Undo" : "Done"}
      </button>
      <button
        className="border rounded px-2 py-1 text-sm"
        onClick={async () => {
          await remove(r.id);
        }}
      >
        Delete
      </button>
    </div>
  </div>
</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}