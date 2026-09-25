import { inUsOrCanada, isEntryLevelTitle } from "@/lib/jobSources/filters";
import { type FeedJob, inferCategory, type SourceResult } from "@/lib/jobSources/types";

// JSearch (RapidAPI) returns Google for Jobs results, which include LinkedIn, Indeed, Glassdoor,
// and company sites. It needs a free RapidAPI key (JSEARCH_API_KEY); without one it's skipped.
const QUERIES = [
  { query: "new grad software engineer", country: "us" },
  { query: "entry level software engineer", country: "us" },
  { query: "new grad software engineer", country: "ca" },
];

type JSearchJob = {
  job_id: string;
  employer_name?: string;
  job_title?: string;
  job_apply_link?: string;
  job_city?: string | null;
  job_state?: string | null;
  job_country?: string | null;
  job_is_remote?: boolean;
  job_posted_at_timestamp?: number | null;
  job_publisher?: string | null;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_period?: string | null;
};

export function jsearchEnabled() {
  return Boolean(process.env.JSEARCH_API_KEY?.trim());
}

function formatSalary(job: JSearchJob) {
  if (!job.job_min_salary && !job.job_max_salary) return null;
  const toK = (value?: number | null) => (value ? `$${Math.round(value / 1000)}k` : "");
  const range = [toK(job.job_min_salary), toK(job.job_max_salary)].filter(Boolean).join(" - ");
  return job.job_salary_period === "YEAR" || !job.job_salary_period ? `${range}/yr` : range;
}

export async function fetchJSearch(cutoff: number): Promise<SourceResult> {
  const apiKey = process.env.JSEARCH_API_KEY!.trim();
  const jobs: FeedJob[] = [];

  for (const { query, country } of QUERIES) {
    const params = new URLSearchParams({ query, country, date_posted: "week", page: "1", num_pages: "1" });
    const res = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
      headers: { "x-rapidapi-key": apiKey, "x-rapidapi-host": "jsearch.p.rapidapi.com" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`JSearch returned status ${res.status}.`);

    const data = (await res.json()) as { data?: JSearchJob[] };
    for (const job of data.data ?? []) {
      const title = job.job_title?.trim();
      const company = job.employer_name?.trim();
      const postedAt = (job.job_posted_at_timestamp ?? 0) * 1000;
      const location = [job.job_city, job.job_state, job.job_country].filter(Boolean).join(", ");
      const locations = [job.job_is_remote && !location ? "Remote" : location].filter(Boolean);

      if (!title || !company || !job.job_apply_link || postedAt < cutoff) continue;
      if (!isEntryLevelTitle(title) || !inUsOrCanada(locations)) continue;

      jobs.push({
        id: `jsearch:${job.job_id}`,
        company,
        title,
        url: job.job_apply_link,
        locations,
        category: inferCategory(title),
        sponsorship: null,
        degrees: [],
        salary: formatSalary(job),
        postedAt,
        postedApprox: false,
        sources: [job.job_publisher?.trim() || "JSearch"],
      });
    }
  }

  return { source: "LinkedIn / Indeed (JSearch)", jobs };
}
