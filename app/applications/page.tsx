"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import { PageFrame } from "@/components/PageFrame";

type Application = {
  id: string;
  company: string;
  role: string;
  stage: string;
  dateApplied: string;
  nextFollowUpDate?: string | null;
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
  const { t, tValue } = useI18n();
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
      eyebrow={t("pipeline.eyebrow")}
      title={t("pipeline.title")}
      subtitle={t("pipeline.subtitle")}
      actions={
        <>
          {loading ? <div className="badge badge-neutral">{t("common.searching")}</div> : null}
          <Link href="/api/export/applications" className="app-button">
            {t("pipeline.exportCsv")}
          </Link>
        </>
      }
    >
      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="field-label" htmlFor="search">
              {t("pipeline.search")}
            </label>
            <input
              id="search"
              className="field-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("pipeline.searchPlaceholder")}
            />
          </div>

          <div className="min-w-[190px]">
            <label className="field-label" htmlFor="stage">
              {t("common.stage")}
            </label>
            <select
              id="stage"
              className="field-select"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="">{t("pipeline.all")}</option>
              {["applied", "interview", "rejected", "offer"].map((value) => (
                <option key={value} value={value}>
                  {tValue("stage", value)}
                </option>
              ))}
            </select>
          </div>

          <div className="mini-stat min-w-[180px]">
            <div className="mini-stat-label">{t("pipeline.visible")}</div>
            <div className="mini-stat-value">{items.length}</div>
          </div>
        </div>
      </section>

      {items.length === 0 ? (
        <section className="panel-card">
          <div className="empty-state">
            {hasFilters ? t("pipeline.noResults") : t("pipeline.noApplications")}
          </div>
        </section>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([group, list]) => (
            <section key={group} className="panel-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={stageBadgeClass(group)}>{tValue("stage", group)}</span>
                  <div className="section-subtitle">
                    {t("pipeline.tracked", { count: list.length })}
                  </div>
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
                            {tValue("stage", application.stage)}
                          </span>
                          <span className="badge badge-neutral">
                            {t("pipeline.applied", { date: application.dateApplied })}
                          </span>
                          {application.nextFollowUpDate ? (
                            <span className="badge badge-neutral">
                              {t("pipeline.followUp", { date: application.nextFollowUpDate })}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <Link
                        href={`/applications/${application.id}`}
                        className="app-button-secondary"
                      >
                        {t("common.edit")}
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
