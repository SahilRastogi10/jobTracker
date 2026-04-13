"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageFrame } from "@/components/PageFrame";

type Application = {
  id: string;
  company: string;
  role: string;
  stage: string;
  dateApplied: string;
  followUpDate?: string | null;
};

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
    void load(stage, debouncedQ);
  }, [stage, debouncedQ]);

  const grouped = useMemo(() => {
    const m: Record<string, Application[]> = {};
    for (const item of items) {
      (m[item.stage] ??= []).push(item);
    }
    return m;
  }, [items]);

  const hasFilters = stage !== "" || debouncedQ.trim() !== "";

  return (
    <PageFrame
      title="Applications"
      subtitle="Search by company or role, slice the list by stage, and keep your pipeline readable as it grows."
      actions={
        <>
          {loading ? <div className="badge badge-neutral">Searching...</div> : null}
          <Link href="/api/export/applications" className="app-button">
            Export CSV
          </Link>
        </>
      }
    >
      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="field-label" htmlFor="search">
              Search
            </label>
            <input
              id="search"
              className="field-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Company or role"
            />
          </div>

          <div className="min-w-[190px]">
            <label className="field-label" htmlFor="stage">
              Stage
            </label>
            <select
              id="stage"
              className="field-select"
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

          <div className="mini-stat min-w-[180px]">
            <div className="mini-stat-label">Visible</div>
            <div className="mini-stat-value">{items.length}</div>
          </div>
        </div>
      </section>

      {items.length === 0 ? (
        <section className="panel-card">
          <div className="empty-state">
            {hasFilters ? "No results matched those filters." : "No applications yet."}
          </div>
        </section>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([group, list]) => (
            <section key={group} className="panel-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={stageBadgeClass(group)}>{group}</span>
                  <div className="section-subtitle">{list.length} tracked</div>
                </div>
              </div>

              <ul className="space-y-3">
                {list.map((application) => (
                  <li key={application.id} className="list-card">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div>
                          <div className="text-lg font-semibold">{application.company}</div>
                          <div className="section-subtitle">{application.role}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={stageBadgeClass(application.stage)}>
                            {application.stage}
                          </span>
                          <span className="badge badge-neutral">
                            Applied {application.dateApplied}
                          </span>
                          {application.followUpDate ? (
                            <span className="badge badge-neutral">
                              Follow up {application.followUpDate}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <Link
                        href={`/applications/${application.id}`}
                        className="app-button-secondary"
                      >
                        Edit
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageFrame>
  );
}
