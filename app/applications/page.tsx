"use client";

import { useEffect, useMemo, useState } from "react";

type Application = {
  id: string;
  company: string;
  role: string;
  stage: string;
  dateApplied: string;
  followUpDate?: string | null;
};

export default function ApplicationsPage() {
  const [items, setItems] = useState<Application[]>([]);
  const [stage, setStage] = useState<string>("");

  async function load() {
    const qs = new URLSearchParams();
    if (stage) qs.set("stage", stage);

    const res = await fetch(`/api/applications?${qs.toString()}`);
    const data = await res.json();
    setItems(data.items ?? []);
  }

  useEffect(() => {
    load();
  }, [stage]);

  const grouped = useMemo(() => {
    const m: Record<string, Application[]> = {};
    for (const it of items) {
      (m[it.stage] ??= []).push(it);
    }
    return m;
  }, [items]);

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Applications</h1>

        <div className="flex gap-3 items-center flex-wrap">
          <a className="underline text-sm" href="/">
            Home
          </a>
          <a className="underline text-sm" href="/calendar">
            Calendar
          </a>
          <a className="underline text-sm" href="/reminders">
            Reminders
          </a>
          <a className="underline text-sm" href="/api/export/applications">
            Export CSV
          </a>

          <div className="flex items-center gap-2">
            <label className="text-sm opacity-70">Stage</label>
            <select
              className="border rounded px-2 py-1"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="">All</option>
              <option value="applied">applied</option>
              <option value="interview">interview</option>
              <option value="rejected">rejected</option>
              <option value="offer">offer</option>
            </select>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="opacity-70">No applications yet.</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([k, list]) => (
            <section key={k} className="space-y-2">
              <h2 className="text-lg font-medium">{k}</h2>
              <ul className="space-y-2">
                {list.map((a) => (
                  <li key={a.id} className="border rounded p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{a.company}</div>
                        <div className="opacity-80">{a.role}</div>
                        <div className="text-sm opacity-70">
                          Applied: {a.dateApplied}
                          {a.followUpDate ? ` | Follow up: ${a.followUpDate}` : ""}
                        </div>
                      </div>

                      <a className="underline text-sm" href={`/applications/${a.id}`}>
                        Edit
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}