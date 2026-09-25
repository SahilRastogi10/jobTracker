// New-grad openings in the US and Canada from several free sources, merged so the same job
// found in two places shows up once with both sources listed.

import { fetchCompanyBoards } from "@/lib/jobSources/companyBoards";
import { mergeDuplicates } from "@/lib/jobSources/dedupe";
import { inUsOrCanada } from "@/lib/jobSources/filters";
import { fetchSimplify, fetchSpeedyApply } from "@/lib/jobSources/githubLists";
import { fetchJSearch, jsearchEnabled } from "@/lib/jobSources/jsearch";
import type { FeedJob, SourceResult } from "@/lib/jobSources/types";

export type { FeedJob } from "@/lib/jobSources/types";

const MINUTE = 60 * 1000;
const MAX_AGE_MS = 7 * 24 * 60 * MINUTE;

type Source = {
  name: string;
  url: string;
  // How long a download stays fresh. Company boards are several MB each, and JSearch's
  // free tier allows about 200 requests a month.
  ttl: number;
  enabled: () => boolean;
  load: (cutoff: number) => Promise<SourceResult>;
};

// Listed from most to least detailed; merged duplicates keep the first source's fields.
const SOURCES: Source[] = [
  {
    name: "Simplify",
    url: "https://github.com/SimplifyJobs/New-Grad-Positions",
    ttl: 30 * MINUTE,
    enabled: () => true,
    load: fetchSimplify,
  },
  {
    name: "speedyapply",
    url: "https://github.com/speedyapply/2026-SWE-College-Jobs",
    ttl: 30 * MINUTE,
    enabled: () => true,
    load: fetchSpeedyApply,
  },
  {
    name: "Company boards",
    url: "https://developers.greenhouse.io/job-board.html",
    ttl: 2 * 60 * MINUTE,
    enabled: () => true,
    load: fetchCompanyBoards,
  },
  {
    name: "LinkedIn / Indeed (JSearch)",
    url: "https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch",
    ttl: 12 * 60 * MINUTE,
    enabled: jsearchEnabled,
    load: fetchJSearch,
  },
];

type SourceCache = { jobs: FeedJob[]; fetchedAt: number; error?: string };

export type SourceStatus = {
  name: string;
  url: string;
  count: number;
  fetchedAt: number | null;
  error?: string;
};

// Kept on globalThis so the dev server's hot reloads don't throw the caches away.
const store = globalThis as typeof globalThis & {
  jobSourceCache?: Map<string, SourceCache>;
  jobSourceLoading?: Map<string, Promise<SourceCache>>;
};
store.jobSourceCache ??= new Map();
store.jobSourceLoading ??= new Map();

async function loadSource(source: Source, refresh: boolean): Promise<SourceCache> {
  const cache = store.jobSourceCache!;
  const loading = store.jobSourceLoading!;
  const cached = cache.get(source.name);
  if (!refresh && cached && Date.now() - cached.fetchedAt < source.ttl) return cached;

  // Share one download between requests that arrive while it's in flight.
  let pending = loading.get(source.name);
  if (!pending) {
    pending = source
      .load(Date.now() - MAX_AGE_MS)
      .then((result) => {
        const entry = {
          jobs: result.jobs.filter((job) => inUsOrCanada(job.locations)),
          fetchedAt: Date.now(),
          error: result.error,
        };
        cache.set(source.name, entry);
        return entry;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Couldn't load this source.";
        // Keep serving the last good copy, but report the failure.
        const entry = cached
          ? { ...cached, error: message }
          : { jobs: [], fetchedAt: Date.now(), error: message };
        cache.set(source.name, entry);
        return entry;
      })
      .finally(() => loading.delete(source.name));
    loading.set(source.name, pending);
  }
  return pending;
}

export async function getJobFeed(options: { refresh?: boolean } = {}) {
  const active = SOURCES.filter((source) => source.enabled());
  const results = await Promise.all(
    active.map((source) => loadSource(source, Boolean(options.refresh)))
  );

  const cutoff = Date.now() - MAX_AGE_MS;
  const jobs = mergeDuplicates(results.flatMap((result) => result.jobs))
    .filter((job) => job.postedAt >= cutoff)
    .sort((a, b) => b.postedAt - a.postedAt);

  const sources: SourceStatus[] = active.map((source, index) => ({
    name: source.name,
    url: source.url,
    count: results[index].jobs.length,
    fetchedAt: results[index].fetchedAt,
    error: results[index].error,
  }));

  return {
    jobs,
    sources,
    fetchedAt: Math.min(...results.map((result) => result.fetchedAt)),
    jsearchAvailable: jsearchEnabled(),
  };
}
