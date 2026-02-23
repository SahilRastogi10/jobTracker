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

export default function HomePage() {
  const [today] = useState(localYYYYMMDD());
  const [goal, setGoal] = useState(5);
  const [note, setNote] = useState("");
  const [apps, setApps] = useState<Application[]>([]);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");

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
  }

  useEffect(() => {
    load();
  }, []);

  async function addApplication() {
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, role, dateApplied: today }),
    });

    if (!res.ok) return;
    setCompany("");
    setRole("");
    await load();
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
      <h1 className="text-2xl font-semibold">Today: {today}</h1>

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
        <h2 className="text-lg font-medium">Daily notes</h2>
        <textarea
          className="border rounded w-full p-3 min-h-[140px]"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="What happened today?"
        />
        <div className="text-sm opacity-70">
          Auto saves after you stop typing.
        </div>
        <a className="underline text-sm" href="/applications">Applications</a>
      </section>
    </main>
  );
}