// Entry-level pay estimates from Levels.fyi, used when a posting doesn't state a salary.
// Levels.fyi offers Markdown versions of its salary pages for tools like this one and asks that
// figures cite and link back to it. Uncached pages are throttled, so requests are paced.

export type LevelsEstimate = {
  median: number; // median yearly total compensation at the entry level
  level: string; // e.g. "L1"
  url: string; // the Levels.fyi page, for attribution
};

const USER_AGENT = "JobTracker/1.0 (personal job search tool)";

// Job family pages on Levels.fyi, chosen from the job title.
export function levelsFamily(title: string, category: string) {
  if (/\b(data scientist|data science)\b/i.test(title)) return "data-scientist";
  if (/\bproduct manag/i.test(title) || category === "Product") return "product-manager";
  if (/\b(product designer|ux|ui designer|designer)\b/i.test(title)) return "product-designer";
  if (/\b(hardware|electrical|asic|fpga|silicon)\b/i.test(title) || category === "Hardware") {
    return "hardware-engineer";
  }
  if (/\b(engineer|developer|swe|programmer)\b/i.test(title)) return "software-engineer";
  return null;
}

// Likely Levels.fyi company slugs, most specific first: "Scale AI" gives "scale-ai" then "scale".
export function companySlugs(company: string) {
  const base = company
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|lp|l\.p)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const first = base.split("-")[0];
  return [...new Set([base, first].filter((slug) => slug.length > 1))];
}

// Returns the estimate, null if the page has no data, or undefined if Levels.fyi sent an empty
// page (throttled or unknown company), which is worth retrying later.
export async function fetchLevelsEstimate(slug: string, family: string) {
  const url = `https://www.levels.fyi/companies/${slug}/salaries/${family}`;
  const res = await fetch(`${url}.md`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return undefined;

  const markdown = await res.text();
  if (!markdown.trim()) return undefined;
  if (!/United States/.test(markdown)) return null;

  // The first row of the "Levels Breakdown" table is the entry level.
  const row = markdown.match(/\| Level \| Median Total Compensation \|\s*\|[^\n]*\|\s*\| ([^|]+?) \| \$([\d,]+) \|/);
  if (row) {
    return { median: Number(row[2].replace(/,/g, "")), level: row[1].trim(), url } satisfies LevelsEstimate;
  }
  return null;
}
