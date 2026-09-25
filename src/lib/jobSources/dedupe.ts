import type { FeedJob } from "@/lib/jobSources/types";

const LEGAL_SUFFIX = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|gmbh)\b/g;
const TITLE_FILLER = /\b(the|a|an|of|and|for|to|in|at|20\d\d)\b/g;

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function companyKey(company: string) {
  return words(company).replace(LEGAL_SUFFIX, " ").replace(/\s+/g, "");
}

// Same words in any order: "Software Engineer, New Grad (2026)" and
// "New Grad Software Engineer" end up with the same key.
function titleKey(title: string) {
  return words(title)
    .replace(TITLE_FILLER, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

// The same posting often shows up under different URLs: a company careers page with
// ?gh_jid=123 and boards.greenhouse.io/company/jobs/123, or with /apply added on Lever.
function atsKey(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const ghId = parsed.searchParams.get("gh_jid");
    if (ghId) return `greenhouse:${ghId}`;
    if (/greenhouse\.io$/.test(host)) {
      const id = parsed.pathname.match(/\/jobs\/(\d+)/)?.[1];
      if (id) return `greenhouse:${id}`;
    }
    if (/lever\.co$/.test(host)) {
      const id = parsed.pathname.match(/[0-9a-f]{8}-[0-9a-f-]{27}/i)?.[0];
      if (id) return `lever:${id.toLowerCase()}`;
    }
    if (/ashbyhq\.com$/.test(host)) {
      const id = parsed.pathname.match(/[0-9a-f]{8}-[0-9a-f-]{27}/i)?.[0];
      if (id) return `ashby:${id.toLowerCase()}`;
    }
    const path = parsed.pathname
      .replace(/\/(apply|application|thanks|confirmation)\/?$/i, "")
      .replace(/\/+$/, "");
    return `url:${host.replace(/^www\./, "")}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

function keysFor(job: FeedJob) {
  return [atsKey(job.url), `job:${companyKey(job.company)}|${titleKey(job.title)}`].filter(
    (key): key is string => Boolean(key)
  );
}

// Merges listings of the same job from different sources into one entry. Earlier sources
// win for the main fields, so pass the most detailed source first.
export function mergeDuplicates(jobs: FeedJob[]) {
  const merged: FeedJob[] = [];
  const byKey = new Map<string, FeedJob>();

  for (const job of jobs) {
    const keys = keysFor(job);
    const existing = keys.map((key) => byKey.get(key)).find(Boolean);

    if (!existing) {
      const copy = { ...job, sources: [...job.sources] };
      merged.push(copy);
      keys.forEach((key) => byKey.set(key, copy));
      continue;
    }

    for (const source of job.sources) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
    }
    existing.salary ??= job.salary;
    existing.sponsorship ??= job.sponsorship;
    if (existing.degrees.length === 0) existing.degrees = job.degrees;
    // Keep the earliest exact posting time we know of.
    if (existing.postedApprox && !job.postedApprox) {
      existing.postedAt = job.postedAt;
      existing.postedApprox = false;
    } else if (!job.postedApprox && job.postedAt < existing.postedAt) {
      existing.postedAt = job.postedAt;
    }
    for (const location of job.locations) {
      if (!existing.locations.includes(location)) existing.locations.push(location);
    }
    keys.forEach((key) => byKey.set(key, existing));
  }

  return merged;
}
