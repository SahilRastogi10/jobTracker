"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(false);

  const reqIdRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function load(activeStage: string, activeQ: string) {
    const myReqId = ++reqIdRef.current;
    setLoading(true);

    const qs = new URLSearchParams();
    if (activeStage) qs.set("stage", activeStage);
    if (activeQ.trim()) qs.set("q", activeQ.trim());

    try {
      const res = await fetch(`/api/applications?${qs.toString()}`);
      const data = await res.json();

      // only apply latest response
      if (myReqId === reqIdRef.current) {
        setItems(data.items ?? []);
      }
    } finally {
      if (myReqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    load(stage, debouncedQ);
  }, [stage, debouncedQ]);

  const grouped = useMemo(() => {
    const m: Record<string, Application[]> = {};
    for (const it of items) {
      (m[it.stage] ??= []).push(it);
    }
    return m;
  }, [items]);

  const hasFilters = stage !== "" || debouncedQ.trim() !== "";

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">Applications</h1>
          {loading ? <div className="text-sm opacity-70">Searching...</div> : null}
        </div>

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
            <label className="text-sm opacity-70">Search</label>
            <input
              className="border rounded px-2 py-1"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Company or role"
            />
          </div>

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
        <div className="opacity-70">
          {hasFilters ? "No results." : "No applications yet."}
        </div>
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