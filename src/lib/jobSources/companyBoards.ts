import { inUsOrCanada, isEntryLevelTitle } from "@/lib/jobSources/filters";
import { type FeedJob, inferCategory, type SourceResult } from "@/lib/jobSources/types";

// Public job-board APIs that companies use for their own careers pages. No key needed.
// Board names are checked to exist; a board that later disappears is skipped quietly.
const BOARDS = {
  greenhouse: [
    ["airbnb", "Airbnb"], ["stripe", "Stripe"], ["databricks", "Databricks"], ["figma", "Figma"],
    ["robinhood", "Robinhood"], ["coinbase", "Coinbase"], ["discord", "Discord"], ["dropbox", "Dropbox"],
    ["pinterest", "Pinterest"], ["reddit", "Reddit"], ["lyft", "Lyft"], ["instacart", "Instacart"],
    ["asana", "Asana"], ["twilio", "Twilio"], ["cloudflare", "Cloudflare"], ["datadog", "Datadog"],
    ["mongodb", "MongoDB"], ["elastic", "Elastic"], ["gitlab", "GitLab"], ["hubspot", "HubSpot"],
    ["duolingo", "Duolingo"], ["affirm", "Affirm"], ["chime", "Chime"], ["brex", "Brex"],
    ["gusto", "Gusto"], ["samsara", "Samsara"], ["anthropic", "Anthropic"], ["scaleai", "Scale AI"],
    ["roblox", "Roblox"], ["verkada", "Verkada"], ["vercel", "Vercel"], ["okta", "Okta"],
    ["toast", "Toast"], ["nuro", "Nuro"], ["waymo", "Waymo"], ["airtable", "Airtable"],
    ["webflow", "Webflow"], ["flexport", "Flexport"], ["faire", "Faire"], ["mercury", "Mercury"],
  ],
  lever: [
    ["palantir", "Palantir"], ["spotify", "Spotify"], ["zoox", "Zoox"], ["ro", "Ro"],
    ["wealthsimple", "Wealthsimple"], ["kraken", "Kraken"],
  ],
  ashby: [
    ["openai", "OpenAI"], ["notion", "Notion"], ["ramp", "Ramp"], ["linear", "Linear"],
    ["posthog", "PostHog"], ["replit", "Replit"], ["perplexity", "Perplexity"], ["cohere", "Cohere"],
    ["modal", "Modal"], ["sierra", "Sierra"],
  ],
} as const;

const CONCURRENCY = 6;

type Candidate = {
  id: string;
  title: string;
  url: string;
  locations: string[];
  postedAt: number;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as T;
}

async function greenhouse(board: string): Promise<Candidate[]> {
  type Job = {
    id: number;
    title: string;
    absolute_url: string;
    location?: { name?: string };
    first_published?: string;
    updated_at?: string;
  };
  const data = await getJson<{ jobs: Job[] }>(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`);
  return data.jobs.map((job) => ({
    id: `greenhouse:${job.id}`,
    title: job.title,
    url: job.absolute_url,
    // Greenhouse puts several cities in one string: "San Francisco, CA; New York, NY" or "... • ...".
    locations: (job.location?.name ?? "").split(/;|\s\|\s|\s•\s/).map((value) => value.trim()),
    postedAt: Date.parse(job.first_published ?? job.updated_at ?? ""),
  }));
}

async function lever(board: string): Promise<Candidate[]> {
  type Job = {
    id: string;
    text: string;
    hostedUrl: string;
    createdAt: number;
    categories?: { location?: string; allLocations?: string[] };
    country?: string;
  };
  const data = await getJson<Job[]>(`https://api.lever.co/v0/postings/${board}?mode=json`);
  return data.map((job) => ({
    id: `lever:${job.id}`,
    title: job.text,
    url: job.hostedUrl,
    locations: [
      ...(job.categories?.allLocations ?? [job.categories?.location ?? ""]),
      job.country ?? "",
    ].filter(Boolean),
    postedAt: job.createdAt,
  }));
}

async function ashby(board: string): Promise<Candidate[]> {
  type Job = {
    id: string;
    title: string;
    jobUrl: string;
    location?: string;
    secondaryLocations?: Array<{ location?: string }>;
    address?: { postalAddress?: { addressCountry?: string } };
    publishedAt?: string;
    isListed?: boolean;
  };
  const data = await getJson<{ jobs: Job[] }>(`https://api.ashbyhq.com/posting-api/job-board/${board}`);
  return data.jobs
    .filter((job) => job.isListed !== false)
    .map((job) => ({
      id: `ashby:${job.id}`,
      title: job.title,
      url: job.jobUrl,
      locations: [
        job.location ?? "",
        ...(job.secondaryLocations ?? []).map((item) => item.location ?? ""),
        job.address?.postalAddress?.addressCountry ?? "",
      ].filter(Boolean),
      postedAt: Date.parse(job.publishedAt ?? ""),
    }));
}

const loaders = { greenhouse, lever, ashby };

// Runs async tasks with at most `limit` in flight.
async function mapWithLimit<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const current = items[index++];
        results.push(await task(current));
      }
    })
  );
  return results;
}

export async function fetchCompanyBoards(cutoff: number): Promise<SourceResult> {
  const boards = (Object.keys(BOARDS) as Array<keyof typeof BOARDS>).flatMap((system) =>
    BOARDS[system].map(([board, company]) => ({ system, board, company }))
  );

  let failed = 0;
  const perBoard = await mapWithLimit(boards, CONCURRENCY, async ({ system, board, company }) => {
    try {
      const candidates = await loaders[system](board);
      return candidates
        .filter(
          (job) =>
            job.postedAt >= cutoff &&
            isEntryLevelTitle(job.title) &&
            inUsOrCanada(job.locations)
        )
        .map<FeedJob>((job) => ({
          id: job.id,
          company,
          title: job.title.trim(),
          url: job.url,
          locations: job.locations.filter((location) => location.length > 2),
          category: inferCategory(job.title),
          sponsorship: null,
          degrees: [],
          salary: null,
          postedAt: job.postedAt,
          postedApprox: false,
          sources: ["Company boards"],
        }));
    } catch {
      failed += 1;
      return [];
    }
  });

  return {
    source: "Company boards",
    jobs: perBoard.flat(),
    error: failed > 0 ? `${failed} of ${boards.length} boards couldn't be read.` : undefined,
  };
}
