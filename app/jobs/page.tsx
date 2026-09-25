"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TODAY_CHANGED_EVENT } from "@/components/AppNav";
import { useI18n } from "@/components/LanguageProvider";
import { PageFrame } from "@/components/PageFrame";
import { localYYYYMMDD } from "@/lib/localDate";

type Job = {
  id: string;
  company: string;
  title: string;
  url: string;
  locations: string[];
  category: string;
  sponsorship: string | null;
  degrees: string[];
  salary: string | null;
  postedAt: number;
  postedApprox: boolean;
  sources: string[];
  applicationId: string | null;
};

type SourceStatus = {
  name: string;
  url: string;
  count: number;
  error?: string;
};

type FeedResponse = {
  items: Job[];
  fetchedAt: number;
  counts: { "24h": number; "7d": number };
  sources: SourceStatus[];
  jsearchAvailable: boolean;
};

type FeedWindow = "24h" | "7d";

const MAX_LOCATIONS = 2;

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Request failed.");
  }
  return data as T;
}

function addDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  return localYYYYMMDD(new Date(y, m - 1, d + days));
}

export default function JobFeedPage() {
  const { t, tValue, dateLocale } = useI18n();

  const [feedWindow, setFeedWindow] = useState<FeedWindow>("24h");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [hideTracked, setHideTracked] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(nextWindow: FeedWindow, refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await requestJson<FeedResponse>(
        `/api/job-feed?window=${nextWindow}${refresh ? "&refresh=1" : ""}`
      );
      setFeed(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("jobs.errLoad"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load(feedWindow);
    // Reload on window changes only; switching language needs no refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedWindow]);

  const relative = useMemo(() => new Intl.RelativeTimeFormat(dateLocale, { numeric: "auto" }), [dateLocale]);

  function timeAgo(timestamp: number, approximate = false) {
    // Sources that only give a day count can't say "3 hours ago".
    if (approximate) {
      const days = Math.floor((Date.now() - timestamp) / 86_400_000);
      return relative.format(-days, "day");
    }
    const minutes = Math.round((timestamp - Date.now()) / 60000);
    if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return relative.format(hours, "hour");
    return relative.format(Math.round(hours / 24), "day");
  }

  const categories = useMemo(
    () => [...new Set((feed?.items ?? []).map((job) => job.category))].sort(),
    [feed]
  );
  // Individual sites (a JSearch result may say "LinkedIn" or "Indeed"), for the source filter.
  const sourceNames = useMemo(
    () => [...new Set((feed?.items ?? []).flatMap((job) => job.sources))].sort(),
    [feed]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (feed?.items ?? []).filter(
      (job) =>
        (!category || job.category === category) &&
        (!sourceFilter || job.sources.includes(sourceFilter)) &&
        (!hideTracked || !job.applicationId) &&
        (!needle ||
          `${job.company} ${job.title} ${job.locations.join(" ")}`.toLowerCase().includes(needle))
    );
  }, [feed, query, category, sourceFilter, hideTracked]);

  // Grouped by the local day each opening was posted, newest first.
  const groups = useMemo(() => {
    const today = localYYYYMMDD();
    const byDay = new Map<string, Job[]>();
    for (const job of visible) {
      const day = localYYYYMMDD(new Date(job.postedAt));
      byDay.set(day, [...(byDay.get(day) ?? []), job]);
    }
    return [...byDay.entries()].map(([day, jobs]) => {
      const [y, m, d] = day.split("-").map(Number);
      const label =
        day === today
          ? t("common.today")
          : day === addDays(today, -1)
            ? t("common.yesterday")
            : new Date(y, m - 1, d).toLocaleDateString(dateLocale, {
                weekday: "long",
                month: "short",
                day: "numeric",
              });
      return { day, label, jobs };
    });
  }, [visible, t, dateLocale]);

  async function logApplied(job: Job) {
    setBusyId(job.id);
    setError(null);

    try {
      const today = localYYYYMMDD();
      const data = await requestJson<{ item: { id: string } }>("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: job.company,
          role: job.title,
          link: job.url,
          dateApplied: today,
          followUpDate: addDays(today, 7),
        }),
      });
      setFeed((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === job.id ? { ...item, applicationId: data.item.id } : item
              ),
            }
          : current
      );
      window.dispatchEvent(new Event(TODAY_CHANGED_EVENT));
    } catch (logError) {
      setError(logError instanceof Error ? logError.message : t("jobs.errLog"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageFrame
      eyebrow={t("jobs.eyebrow")}
      title={t("jobs.title")}
      subtitle={t("jobs.subtitle")}
      actions={
        <>
          {feed ? (
            <span className="section-subtitle text-xs">
              {t("jobs.updated", { time: timeAgo(feed.fetchedAt) })}
            </span>
          ) : null}
          <button
            className="app-button-secondary"
            onClick={() => load(feedWindow, true)}
            disabled={refreshing || loading}
          >
            {refreshing ? t("jobs.refreshing") : t("jobs.refresh")}
          </button>
        </>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="segmented" role="tablist">
            {(["24h", "7d"] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={feedWindow === value}
                className={feedWindow === value ? "is-active" : ""}
                onClick={() => setFeedWindow(value)}
              >
                {value === "24h" ? t("jobs.window24h") : t("jobs.window7d")}
                {feed ? <span className="ml-1.5 opacity-70">{feed.counts[value]}</span> : null}
              </button>
            ))}
          </div>

          <input
            className="field-input min-w-[14rem] flex-1"
            placeholder={t("jobs.searchPlaceholder")}
            aria-label={t("jobs.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <select
            className="field-select !w-auto"
            aria-label={t("jobs.sourceFilter")}
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">{t("jobs.allSources")}</option>
            {sourceNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {["", ...categories].map((value) => (
              <button
                key={value || "all"}
                className="filter-chip"
                data-active={category === value}
                onClick={() => setCategory(value)}
              >
                {value ? tValue("jobs.category", value) : t("jobs.allCategories")}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-[color:var(--ink-soft)]">
            <input
              type="checkbox"
              className="accent-[color:var(--ink)]"
              checked={hideTracked}
              onChange={(e) => setHideTracked(e.target.checked)}
            />
            {t("jobs.hideTracked")}
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="section-subtitle font-semibold">
          {visible.length === 1 ? t("jobs.showingOne") : t("jobs.showing", { count: visible.length })}
        </div>
        {feed ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="section-subtitle">{t("jobs.sources")}:</span>
            {feed.sources.map((source) => (
              <a
                key={source.name}
                className="subtle-link"
                href={source.url}
                target="_blank"
                rel="noreferrer"
                title={source.error}
              >
                {source.name} ({source.count}){source.error ? " !" : ""}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {feed?.sources
        .filter((source) => source.error)
        .map((source) => (
          <div key={source.name} className="error-banner text-sm">
            {t("jobs.sourceFailed", { name: source.name, error: source.error ?? "" })}
          </div>
        ))}
      {feed && !feed.jsearchAvailable ? (
        <p className="section-subtitle text-xs">{t("jobs.jsearchHint")}</p>
      ) : null}

      {loading ? (
        <div className="empty-state">{t("jobs.loading")}</div>
      ) : groups.length === 0 ? (
        <div className="empty-state">{t("jobs.none")}</div>
      ) : (
        groups.map((group) => (
          <section key={group.day} className="space-y-2">
            <div className="agenda-group-label capitalize">
              {group.label} <span>{group.jobs.length}</span>
            </div>

            <ul className="space-y-2">
              {group.jobs.map((job) => {
                const extraLocations = job.locations.length - MAX_LOCATIONS;
                const matchHref = `/match?url=${encodeURIComponent(job.url)}`;

                return (
                  <li key={job.id} className="job-card" data-tracked={Boolean(job.applicationId)}>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold">{job.company}</span>
                        <span className="section-subtitle text-xs">
                          {timeAgo(job.postedAt, job.postedApprox)}
                        </span>
                      </div>
                      <div className="font-display text-lg leading-snug">{job.title}</div>
                      <div className="section-subtitle text-sm">
                        {job.locations.slice(0, MAX_LOCATIONS).join(" | ")}
                        {extraLocations > 0
                          ? ` ${t("jobs.moreLocations", { count: extraLocations })}`
                          : ""}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="badge badge-neutral">{tValue("jobs.category", job.category)}</span>
                        {job.degrees.map((degree) => (
                          <span key={degree} className="badge badge-neutral">
                            {tValue("jobs.degree", degree)}
                          </span>
                        ))}
                        {job.salary ? <span className="badge badge-offer">{job.salary}</span> : null}
                        {job.sponsorship ? (
                          <span
                            className={
                              job.sponsorship === "Offers Sponsorship"
                                ? "badge badge-offer"
                                : "badge badge-rejected"
                            }
                          >
                            {tValue("jobs.sponsorship", job.sponsorship)}
                          </span>
                        ) : null}
                      </div>
                      <div className="section-subtitle text-xs">
                        {t("jobs.foundOn")}: {job.sources.join(" | ")}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                      <a className="app-button" href={job.url} target="_blank" rel="noreferrer">
                        {t("jobs.open")}
                      </a>
                      <div className="flex gap-2">
                        <Link className="app-button-secondary" href={matchHref}>
                          {t("jobs.checkMatch")}
                        </Link>
                        {job.applicationId ? (
                          <Link
                            className="app-button-secondary !border-[color:var(--stage-offer)] !text-[color:var(--stage-offer)]"
                            href={`/applications/${job.applicationId}`}
                          >
                            {t("jobs.inTracker")}
                          </Link>
                        ) : (
                          <button
                            className="app-button-secondary"
                            onClick={() => logApplied(job)}
                            disabled={busyId === job.id}
                          >
                            {busyId === job.id ? t("jobs.logging") : t("jobs.logApplied")}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </PageFrame>
  );
}
