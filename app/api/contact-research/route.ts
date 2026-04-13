export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  favicon?: string;
};

type EmailMention = {
  email: string;
  sourceTitle: string;
  sourceUrl: string;
  context: string;
  relevance: number;
};

function getHostname(url: string | null | undefined) {
  if (!url) return null;

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function dedupeResults(results: TavilyResult[]) {
  const seen = new Set<string>();
  const deduped: TavilyResult[] = [];

  for (const result of results) {
    const url = String(result.url ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    deduped.push(result);
  }

  return deduped;
}

function clipText(value: string, maxLength: number) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trim()}...`;
}

function emailLocalPart(email: string) {
  return email.split("@")[0]?.toLowerCase() ?? "";
}

function scoreEmailMention(
  email: string,
  context: string,
  sourceTitle: string,
  sourceUrl: string,
  company: string,
  host: string | null
) {
  let score = 0;
  const local = emailLocalPart(email);
  const haystack = `${context} ${sourceTitle} ${sourceUrl}`.toLowerCase();

  const recruitingTerms = [
    "recruit",
    "recruiter",
    "recruiting",
    "talent",
    "talent acquisition",
    "hiring",
    "human resources",
    "hr",
    "sourcer",
    "staffing",
    "careers",
    "jobs",
  ];

  const unwantedTerms = [
    "investor",
    "press",
    "media",
    "privacy",
    "legal",
    "support",
    "help",
    "sales",
    "webmaster",
    "security",
    "abuse",
    "billing",
  ];

  for (const term of recruitingTerms) {
    if (haystack.includes(term) || local.includes(term.replace(/\s+/g, ""))) {
      score += 3;
    }
  }

  for (const term of unwantedTerms) {
    if (haystack.includes(term) || local.includes(term)) {
      score -= 4;
    }
  }

  if (host && email.endsWith(`@${host}`)) {
    score += 3;
  }

  if (haystack.includes(company.toLowerCase())) {
    score += 2;
  }

  if (/^[a-z]+\.[a-z]+$/.test(local) || /^[a-z]+[a-z0-9]*$/.test(local)) {
    score += 1;
  }

  return score;
}

function extractEmailMentions(
  results: TavilyResult[],
  company: string,
  host: string | null
) {
  const mentions: EmailMention[] = [];
  const seen = new Set<string>();
  const pattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

  for (const result of results) {
    const content = String(result.content ?? "");
    const sourceTitle = String(result.title ?? "Untitled source");
    const sourceUrl = String(result.url ?? "");

    for (const match of content.matchAll(pattern)) {
      const email = match[0].toLowerCase();
      const key = `${email}:${sourceUrl}`;

      if (!sourceUrl || seen.has(key)) continue;

      const start = Math.max(0, (match.index ?? 0) - 90);
      const end = Math.min(content.length, (match.index ?? 0) + email.length + 90);
      const context = clipText(content.slice(start, end), 220);

      const relevance = scoreEmailMention(
        email,
        context,
        sourceTitle,
        sourceUrl,
        company,
        host
      );

      seen.add(key);
      mentions.push({ email, sourceTitle, sourceUrl, context, relevance });
    }
  }

  return mentions.sort((a, b) => b.relevance - a.relevance);
}

function splitEmailMentions(mentions: EmailMention[]) {
  const recruiterEmails: EmailMention[] = [];
  const otherEmails: EmailMention[] = [];

  for (const mention of mentions) {
    if (mention.relevance >= 4) {
      recruiterEmails.push(mention);
    } else if (mention.relevance >= 0) {
      otherEmails.push(mention);
    }
  }

  return {
    recruiterEmails: recruiterEmails.slice(0, 8),
    otherEmails: otherEmails.slice(0, 6),
  };
}

async function searchTavily(query: string, includeDomains?: string[]) {
  const apiKey = process.env.TINYFISH_API_KEY ?? process.env.TAVILY_API_KEY;
  const baseUrl =
    process.env.TINYFISH_BASE_URL ??
    process.env.TAVILY_BASE_URL ??
    "https://api.tavily.com";

  if (!apiKey) {
    throw new Error("Missing search API key.");
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      topic: "general",
      search_depth: "advanced",
      max_results: 6,
      include_answer: false,
      include_favicon: true,
      ...(includeDomains && includeDomains.length > 0
        ? { include_domains: includeDomains }
        : {}),
    }),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof data?.detail === "string"
        ? data.detail
        : typeof data?.error === "string"
          ? data.error
          : "Search request failed.";
    throw new Error(message);
  }

  return Array.isArray(data?.results) ? (data.results as TavilyResult[]) : [];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const company = String(body.company ?? "").trim();
    const role = String(body.role ?? "").trim();
    const link = body.link ? String(body.link).trim() : "";

    if (!company || !role) {
      return NextResponse.json(
        { error: "company and role are required" },
        { status: 400 }
      );
    }

    const host = getHostname(link);
    const companyDomains = host ? [host] : undefined;

    const queries = {
      recruiterEmails: `"${company}" recruiter email OR recruiting email OR talent acquisition email OR careers email`,
      recruiterProfiles: `"${company}" recruiter OR "talent acquisition" OR sourcer "${role}" LinkedIn`,
      companyPages: `"${company}" careers OR recruiting OR talent OR hiring team`,
    };

    const recruiterEmailQueries = [
      queries.recruiterEmails,
      `"${company}" "${role}" recruiter email OR hiring email OR talent acquisition email`,
      host
        ? `site:${host} recruiting email OR recruiter email OR talent acquisition email OR careers contact`
        : null,
    ].filter((query): query is string => Boolean(query));

    const [emailResultGroups, profileResults, companyPageResults] =
      await Promise.all([
        Promise.all(
          recruiterEmailQueries.map((query) =>
            searchTavily(query, companyDomains)
          )
        ),
        searchTavily(queries.recruiterProfiles),
        searchTavily(queries.companyPages, companyDomains),
      ]);

    const emailResults = dedupeResults(emailResultGroups.flat());

    const profiles = dedupeResults(
      profileResults
        .filter((result) => String(result.url ?? "").includes("linkedin.com"))
        .map((result) => ({
          ...result,
          content: clipText(String(result.content ?? ""), 220),
        }))
    ).slice(0, 6);

    const companyPages = dedupeResults(
      companyPageResults.map((result) => ({
        ...result,
        content: clipText(String(result.content ?? ""), 220),
      }))
    ).slice(0, 6);

    const allMentions = extractEmailMentions(
      [...emailResults, ...companyPageResults, ...profileResults],
      company,
      host
    );
    const { recruiterEmails, otherEmails } = splitEmailMentions(allMentions);

    return NextResponse.json({
      provider: "Tavily-compatible search",
      queries,
      recruiterEmails,
      otherEmails,
      profiles,
      companyPages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not run contact research.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
