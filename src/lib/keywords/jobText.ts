const MAX_LENGTH = 30000;

// Thrown for links that can't be fetched at all, as opposed to pages that failed to load.
export class InvalidJobUrlError extends Error {}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&(#39|apos|rsquo|lsquo);/gi, "'")
    .replace(/&(ldquo|rdquo);/gi, '"')
    .replace(/&(ndash|mdash);/gi, "-")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

// Keeps line breaks, because section headings ("Requirements", "Nice to have") drive the score.
export function htmlToText(html: string) {
  const text = html
    .replace(/<(script|style|noscript|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_LENGTH);
}

// Most job boards embed the full description as schema.org JobPosting data.
function jobPostingFromJsonLd(html: string) {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const [, json] of scripts) {
    try {
      const data = JSON.parse(json);
      const nodes = [data, ...(Array.isArray(data) ? data : []), ...(data?.["@graph"] ?? [])];
      for (const node of nodes) {
        const types = [].concat(node?.["@type"] ?? []);
        if (!types.includes("JobPosting" as never) || typeof node.description !== "string") continue;
        const org = node.hiringOrganization;
        const company = typeof org === "string" ? org : org?.name;
        return {
          title: [node.title, company].filter(Boolean).join(" | ") || null,
          company: typeof company === "string" ? company : null,
          text: htmlToText(decodeEntities(node.description)),
        };
      }
    } catch {
      // Malformed JSON-LD; fall back to the page text.
    }
  }
  return null;
}

export async function fetchJobDescription(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidJobUrlError("That doesn't look like a valid link.");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new InvalidJobUrlError("Only http and https links work.");
  }

  const res = await fetch(parsed, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`The job page returned status ${res.status}.`);

  const html = await res.text();
  const fromJsonLd = jobPostingFromJsonLd(html);
  if (fromJsonLd && fromJsonLd.text.length > 200) return fromJsonLd;

  const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = rawTitle
    ? decodeEntities(rawTitle)
        .replace(/\s+/g, " ")
        .replace(/^job application for\s+/i, "")
        .trim()
    : null;
  const siteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1];
  // "Job Application for Design Engineer at Vercel" and similar titles name the company last.
  const company = siteName ?? title?.match(/\bat\s+([^|\-]+?)\s*(?:[|\-].*)?$/i)?.[1] ?? null;
  const text = htmlToText(html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html);
  return { title, company: company ? decodeEntities(company).trim() : null, text };
}
