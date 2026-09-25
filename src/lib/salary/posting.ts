import { parseSalary, periodFrom, type SalaryRange } from "@/lib/salary/parse";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  Accept: "text/html,application/json",
};

async function get(url: string) {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res;
}

function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ");
}

// Workday pages render in the browser; the same data comes from its JSON endpoint:
// https://{tenant}.wd5.myworkdayjobs.com/{locale?}/{site}/job/... maps to /wday/cxs/{tenant}/{site}/job/...
function workdayApiUrl(url: URL) {
  const tenant = url.hostname.split(".")[0];
  const parts = url.pathname.split("/").filter(Boolean);
  if (/^[a-z]{2}-[A-Z]{2}$/.test(parts[0] ?? "")) parts.shift();
  const jobIndex = parts.indexOf("job");
  if (jobIndex < 1) return null;
  return `${url.origin}/wday/cxs/${tenant}/${parts[jobIndex - 1]}/${parts.slice(jobIndex).join("/")}`;
}

// Greenhouse and Lever have per-job APIs that include the full description.
function atsApiUrl(url: URL) {
  if (/greenhouse\.io$/.test(url.hostname)) {
    const match = url.pathname.match(/^\/(?:embed\/job_app\?for=)?([^/]+)\/jobs\/(\d+)/);
    if (match) return `https://boards-api.greenhouse.io/v1/boards/${match[1]}/jobs/${match[2]}?pay_transparency=true`;
  }
  if (url.hostname === "jobs.lever.co") {
    const match = url.pathname.match(/^\/([^/]+)\/([0-9a-f-]{36})/i);
    if (match) return `https://api.lever.co/v0/postings/${match[1]}/${match[2]}`;
  }
  return null;
}

type LeverPosting = {
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: Array<{ content?: string }>;
};

type GreenhouseJob = {
  content?: string;
  pay_input_ranges?: Array<{
    min_cents?: number;
    max_cents?: number;
    currency_type?: string;
    title?: string;
    blurb?: string;
  }>;
};

// Structured salary data some pages publish for search engines (schema.org JobPosting).
function salaryFromJsonLd(html: string): SalaryRange | null {
  for (const [, json] of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(json);
      const nodes = [data, ...(Array.isArray(data) ? data : []), ...(data?.["@graph"] ?? [])];
      for (const node of nodes) {
        const value = node?.baseSalary?.value;
        const min = Number(value?.minValue ?? value?.value);
        const max = Number(value?.maxValue ?? value?.value);
        if (!min || !max) continue;
        const unit = String(value?.unitText ?? "YEAR").toUpperCase();
        const currency = node.baseSalary.currency === "CAD" ? "CAD" : "USD";
        const period = { HOUR: "hour", WEEK: "week", MONTH: "month", YEAR: "year" }[unit];
        if (period) return { min, max, currency, period: period as SalaryRange["period"] };
      }
    } catch {
      // Malformed JSON-LD; fall back to the text.
    }
  }
  return null;
}

// Reads the pay range from a job posting, or null if the posting doesn't state one.
export async function fetchPostingSalary(jobUrl: string): Promise<SalaryRange | null> {
  const url = new URL(jobUrl);

  if (url.hostname.endsWith("myworkdayjobs.com")) {
    const api = workdayApiUrl(url);
    if (api) {
      const data = (await (await get(api)).json()) as { jobPostingInfo?: { jobDescription?: string } };
      return parseSalary(htmlToText(data.jobPostingInfo?.jobDescription ?? ""));
    }
  }

  const api = atsApiUrl(url);
  if (api?.includes("lever.co")) {
    const posting = (await (await get(api)).json()) as LeverPosting;
    const range = posting.salaryRange;
    if (range?.min && range?.max) {
      return {
        min: range.min,
        max: range.max,
        currency: range.currency === "CAD" ? "CAD" : "USD",
        period: periodFrom(range.interval ?? "", range.max),
      };
    }
    const text = [posting.descriptionPlain, posting.additionalPlain, ...(posting.lists ?? []).map((list) => htmlToText(list.content ?? ""))].join(" ");
    return parseSalary(text);
  }
  if (api?.includes("greenhouse.io")) {
    const job = (await (await get(api)).json()) as GreenhouseJob;
    const pay = job.pay_input_ranges?.[0];
    if (pay?.min_cents && pay?.max_cents) {
      return {
        min: pay.min_cents / 100,
        max: pay.max_cents / 100,
        currency: pay.currency_type === "CAD" ? "CAD" : "USD",
        // The blurb says the period: "The base salary for this position is $1,925 per week."
        period: periodFrom(`${pay.title ?? ""} ${pay.blurb ?? ""}`, pay.max_cents / 100),
      };
    }
    // Greenhouse returns the description HTML-escaped.
    return parseSalary(htmlToText(htmlToText(job.content ?? "")));
  }

  const html = await (await get(url.toString())).text();
  return salaryFromJsonLd(html) ?? parseSalary(htmlToText(html)) ?? parseSalary(html.replace(/\\u0024/g, "$"));
}
