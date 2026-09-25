import { type FeedJob, inferCategory, type SourceResult } from "@/lib/jobSources/types";

const SIMPLIFY_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json";
const SPEEDYAPPLY_URL =
  "https://raw.githubusercontent.com/speedyapply/2026-SWE-College-Jobs/main/NEW_GRAD_USA.md";

const DAY_MS = 24 * 60 * 60 * 1000;

type SimplifyListing = {
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

// SimplifyJobs publishes every listing as JSON next to its README.
export async function fetchSimplify(cutoff: number): Promise<SourceResult> {
  const res = await fetch(SIMPLIFY_URL, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GitHub returned status ${res.status}.`);

  const listings = (await res.json()) as SimplifyListing[];
  const jobs: FeedJob[] = listings
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
      id: `simplify:${item.id}`,
      company: item.company_name!.trim(),
      title: item.title!.trim(),
      url: item.url!,
      locations: item.locations ?? [],
      category: item.category ?? inferCategory(item.title!),
      // "Other" means the listing doesn't say, which isn't worth showing.
      sponsorship: item.sponsorship && item.sponsorship !== "Other" ? item.sponsorship : null,
      degrees: item.degrees ?? [],
      salary: null,
      postedAt: item.date_posted! * 1000,
      postedApprox: false,
      sources: ["Simplify"],
    }));

  return { source: "Simplify", jobs };
}

function stripTags(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// "0d", "3d", "2w", "1mo" into days.
function ageInDays(age: string) {
  const match = age.trim().match(/^(\d+)\s*(d|w|mo|m|y)/i);
  if (!match) return null;
  const count = Number(match[1]);
  const unit = match[2].toLowerCase();
  return unit === "d" ? count : unit === "w" ? count * 7 : unit === "y" ? count * 365 : count * 30;
}

// speedyapply keeps its US new-grad list as Markdown tables with inline HTML. The top table
// has a Salary column and the larger one below doesn't:
// | Company | Position | Location | Salary | Posting | Age |
// | Company | Position | Location | Posting | Age |
export async function fetchSpeedyApply(cutoff: number): Promise<SourceResult> {
  const res = await fetch(SPEEDYAPPLY_URL, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GitHub returned status ${res.status}.`);

  const markdown = await res.text();
  const jobs: FeedJob[] = [];

  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 5 && cells.length !== 6) continue;

    const [companyCell, titleCell, locationCell] = cells;
    const salaryCell = cells.length === 6 ? cells[3] : "";
    const [postingCell, ageCell] = cells.slice(-2);
    const url = postingCell.match(/href="([^"]+)"/)?.[1];
    const days = ageInDays(stripTags(ageCell));
    if (!url || days === null) continue;

    // Only a day count is given, so place it mid-day: "0d" is 12 hours ago, which keeps it
    // in the last-24-hours window without sorting it above jobs posted minutes ago.
    const postedAt = Date.now() - (days + 0.5) * DAY_MS;
    if (postedAt < cutoff) continue;

    const title = stripTags(titleCell);
    const company = stripTags(companyCell);
    if (!title || !company) continue;

    const salary = stripTags(salaryCell);
    jobs.push({
      id: `speedyapply:${url}`,
      company,
      title,
      url,
      locations: locationCell
        .split(/<br\s*\/?>|<\/br>|;/i)
        .map(stripTags)
        .filter(Boolean),
      category: inferCategory(title),
      sponsorship: null,
      degrees: [],
      salary: salary && salary !== "-" ? salary : null,
      postedAt,
      postedApprox: true,
      sources: ["speedyapply"],
    });
  }

  return { source: "speedyapply", jobs };
}
