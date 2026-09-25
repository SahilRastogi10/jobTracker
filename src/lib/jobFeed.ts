// New-grad openings from the SimplifyJobs/New-Grad-Positions repository. The repo publishes
// every listing as structured JSON next to its README, which is sturdier than parsing the table.

const LISTINGS_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json";
export const JOB_FEED_SOURCE = "https://github.com/SimplifyJobs/New-Grad-Positions";

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type RawListing = {
  id: string;
  company_name?: string;
  title?: string;
  url?: string;
  locations?: string[];
  category?: string;
  sponsorship?: string;
  degrees?: string[];
  date_posted?: number;
  active?: boolean;
  is_visible?: boolean;
};

export type FeedJob = {
  id: string;
  company: string;
  title: string;
  url: string;
  locations: string[];
  category: string;
  sponsorship: string | null;
  degrees: string[];
  postedAt: number; // epoch milliseconds
};

type FeedCache = { jobs: FeedJob[]; fetchedAt: number };

// Kept on globalThis so the dev server's hot reloads don't throw the cache away.
const store = globalThis as typeof globalThis & {
  jobFeedCache?: FeedCache;
  jobFeedLoading?: Promise<FeedCache>;
};

async function download(): Promise<FeedCache> {
  const res = await fetch(LISTINGS_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`GitHub returned status ${res.status} for the job listings.`);

  const listings = (await res.json()) as RawListing[];
  const cutoff = Date.now() - MAX_AGE_MS;

  // The file holds every listing ever posted (about 20,000); keep only live ones from the last week.
  const jobs = listings
    .filter(
      (item) =>
        item.active &&
        item.is_visible !== false &&
        item.url &&
        item.company_name &&
        item.title &&
        (item.date_posted ?? 0) * 1000 >= cutoff
    )
    .map((item) => ({
      id: item.id,
      company: item.company_name!.trim(),
      title: item.title!.trim(),
      url: item.url!,
      locations: item.locations ?? [],
      category: item.category ?? "Other",
      // "Other" means the listing doesn't say, which isn't worth showing.
      sponsorship: item.sponsorship && item.sponsorship !== "Other" ? item.sponsorship : null,
      degrees: item.degrees ?? [],
      postedAt: item.date_posted! * 1000,
    }))
    .sort((a, b) => b.postedAt - a.postedAt);

  return { jobs, fetchedAt: Date.now() };
}

export async function getJobFeed(options: { refresh?: boolean } = {}) {
  const cached = store.jobFeedCache;
  if (!options.refresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  // Share one download between requests that arrive while it's in flight.
  store.jobFeedLoading ??= download()
    .then((result) => {
      store.jobFeedCache = result;
      return result;
    })
    .finally(() => {
      store.jobFeedLoading = undefined;
    });

  try {
    return await store.jobFeedLoading;
  } catch (error) {
    // Serve the last good copy if GitHub is unreachable.
    if (cached) return cached;
    throw error;
  }
}
