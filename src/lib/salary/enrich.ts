// Attaches a salary to each job-feed opening: the posting's own pay range when it states one,
// otherwise a Levels.fyi entry-level estimate for the company. Lookups run in the background
// and are cached in the SalaryCache table, so the feed never waits on them.

import { prisma } from "@/lib/db";
import type { FeedJob } from "@/lib/jobSources/types";
import { companySlugs, fetchLevelsEstimate, type LevelsEstimate, levelsFamily } from "@/lib/salary/levels";
import { formatSalary, parseSalary, type SalaryRange } from "@/lib/salary/parse";
import { fetchPostingSalary } from "@/lib/salary/posting";

export type SalaryInfo =
  | { kind: "posting"; text: string }
  | { kind: "estimate"; median: number; level: string; url: string }
  | { kind: "pending" }
  | { kind: "none" };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TTL = { found: 14 * DAY, none: 3 * DAY, error: DAY, emptyRetry: HOUR };
const POSTING_CONCURRENCY = 4;
// Levels.fyi serves uncached pages reliably only when requests are spaced out.
const LEVELS_GAP_MS = 15_000;
const LEVELS_EMPTY_ATTEMPTS = 2;

type CachedPosting = { range: SalaryRange } | { none: true; error?: boolean };
type CachedLevels = { estimate: LevelsEstimate } | { none: true } | { empty: number };

type Worker = { queue: Map<string, () => Promise<void>>; running: boolean };

const store = globalThis as typeof globalThis & {
  salaryPostingWorker?: Worker;
  salaryLevelsWorker?: Worker;
};
store.salaryPostingWorker ??= { queue: new Map(), running: false };
store.salaryLevelsWorker ??= { queue: new Map(), running: false };

const postingKey = (url: string) => `posting:${url}`;
const levelsKey = (slug: string, family: string) => `levels:${slug}:${family}`;

async function writeCache(key: string, value: unknown) {
  const data = { value: JSON.stringify(value), fetchedAt: new Date() };
  await prisma.salaryCache.upsert({ where: { key }, update: data, create: { key, ...data } });
}

function isFresh(fetchedAt: Date, value: CachedPosting | CachedLevels) {
  const age = Date.now() - fetchedAt.getTime();
  if ("range" in value || "estimate" in value) return age < TTL.found;
  if ("empty" in value) return value.empty >= LEVELS_EMPTY_ATTEMPTS ? age < TTL.none : age < TTL.emptyRetry;
  if ("error" in value && value.error) return age < TTL.error;
  return age < TTL.none;
}

async function drainPostings(worker: Worker) {
  if (worker.running) return;
  worker.running = true;
  try {
    while (worker.queue.size > 0) {
      const batch = [...worker.queue.entries()].slice(0, POSTING_CONCURRENCY);
      batch.forEach(([key]) => worker.queue.delete(key));
      await Promise.all(batch.map(([, task]) => task().catch(() => {})));
    }
  } finally {
    worker.running = false;
  }
}

async function drainLevels(worker: Worker) {
  if (worker.running) return;
  worker.running = true;
  try {
    while (worker.queue.size > 0) {
      const [key, task] = worker.queue.entries().next().value!;
      worker.queue.delete(key);
      await task().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, LEVELS_GAP_MS));
    }
  } finally {
    worker.running = false;
  }
}

function queuePosting(url: string) {
  const worker = store.salaryPostingWorker!;
  if (worker.queue.has(url)) return;
  worker.queue.set(url, async () => {
    try {
      const range = await fetchPostingSalary(url);
      await writeCache(postingKey(url), range ? { range } : { none: true });
    } catch {
      await writeCache(postingKey(url), { none: true, error: true });
    }
  });
  void drainPostings(worker);
}

function queueLevels(company: string, family: string, slugs: string[]) {
  const worker = store.salaryLevelsWorker!;
  const queueKey = `${slugs[0]}:${family}`;
  if (worker.queue.has(queueKey)) return;
  worker.queue.set(queueKey, async () => {
    for (const slug of slugs) {
      const key = levelsKey(slug, family);
      const existing = await prisma.salaryCache.findUnique({ where: { key } });
      const previous = existing ? (JSON.parse(existing.value) as CachedLevels) : null;
      if (existing && previous && isFresh(existing.fetchedAt, previous)) {
        if ("estimate" in previous) return;
        continue;
      }

      const estimate = await fetchLevelsEstimate(slug, family);
      if (estimate) {
        await writeCache(key, { estimate });
        return;
      }
      const attempts = previous && "empty" in previous ? previous.empty + 1 : 1;
      await writeCache(key, estimate === null ? { none: true } : { empty: attempts });
    }
  });
  void drainLevels(worker);
}

// Salaries for the given openings from the cache, queueing lookups for anything not yet known.
export async function attachSalaries(jobs: FeedJob[]) {
  const needsPosting = jobs.filter((job) => !job.salary);
  const levelsTargets = new Map<string, { family: string; slugs: string[]; company: string }>();
  for (const job of jobs) {
    const family = levelsFamily(job.title, job.category);
    if (family) levelsTargets.set(job.id, { family, slugs: companySlugs(job.company), company: job.company });
  }

  const keys = [
    ...needsPosting.map((job) => postingKey(job.url)),
    ...[...levelsTargets.values()].flatMap(({ family, slugs }) => slugs.map((slug) => levelsKey(slug, family))),
  ];
  const rows = await prisma.salaryCache.findMany({ where: { key: { in: [...new Set(keys)] } } });
  const cache = new Map(
    rows.map((row) => [row.key, { value: JSON.parse(row.value) as CachedPosting & CachedLevels, fetchedAt: row.fetchedAt }])
  );

  let pending = 0;
  const salaries = new Map<string, SalaryInfo>();

  for (const job of jobs) {
    // 1. A salary the source already gave (speedyapply's column, Ashby's pay summary).
    if (job.salary) {
      const range = parseSalary(job.salary);
      salaries.set(job.id, { kind: "posting", text: range ? formatSalary(range) : job.salary });
      continue;
    }

    // 2. The pay range stated in the posting.
    const posting = cache.get(postingKey(job.url));
    if (!posting || !isFresh(posting.fetchedAt, posting.value)) {
      queuePosting(job.url);
      pending += 1;
      salaries.set(job.id, { kind: "pending" });
      continue;
    }
    if ("range" in posting.value) {
      salaries.set(job.id, { kind: "posting", text: formatSalary(posting.value.range) });
      continue;
    }

    // 3. A Levels.fyi estimate when the posting doesn't say.
    const target = levelsTargets.get(job.id);
    if (!target) {
      salaries.set(job.id, { kind: "none" });
      continue;
    }
    const entries = target.slugs.map((slug) => cache.get(levelsKey(slug, target.family)));
    const found = entries.find((entry) => entry && "estimate" in entry.value);
    if (found && "estimate" in found.value) {
      const { median, level, url } = found.value.estimate;
      salaries.set(job.id, { kind: "estimate", median, level, url });
      continue;
    }
    const settled = entries.every((entry) => entry && isFresh(entry.fetchedAt, entry.value));
    if (!settled) {
      queueLevels(target.company, target.family, target.slugs);
      pending += 1;
    }
    salaries.set(job.id, settled ? { kind: "none" } : { kind: "pending" });
  }

  return { salaries, pending };
}
