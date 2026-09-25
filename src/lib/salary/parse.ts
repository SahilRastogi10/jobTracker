// Finds a pay range like "$120,000 - $150,000", "$211.4K to $290.6K", or "$25-$35 per hour"
// in job-posting text, and formats it compactly.

export type SalaryPeriod = "year" | "month" | "week" | "hour";

export type SalaryRange = {
  min: number;
  max: number;
  currency: "USD" | "CAD";
  period: SalaryPeriod;
};

// En and em dashes, built from char codes so the source stays plain ASCII.
const DASHES = String.fromCharCode(0x2013, 0x2014);
const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*([kK])?`;
const RANGE = new RegExp(
  String.raw`((?:US|CA|C)?\$|USD\s*|CAD\s*)\s?${AMOUNT}\s*(?:USD|CAD)?\s*(?:-|to|[${DASHES}])\s*(?:(?:US|CA|C)?\$|USD\s*|CAD\s*)?\s?${AMOUNT}`,
  "g"
);
const PERIOD_WORDS: Array<[SalaryPeriod, RegExp]> = [
  ["hour", /(\/\s*h(ou)?r\b|per\s+hour|an\s+hour|hourly)/i],
  ["week", /(\/\s*w(ee)?k\b|per\s+week|a\s+week|weekly)/i],
  ["month", /(\/\s*mo(nth)?\b|per\s+month|a\s+month|monthly)/i],
  ["year", /(\/\s*y(ea)?r\b|per\s+year|a\s+year|annual|yearly|salary)/i],
];

// Reads the pay period from nearby wording, falling back to the size of the number.
export function periodFrom(text: string, amount: number): SalaryPeriod {
  const found = PERIOD_WORDS.find(([, pattern]) => pattern.test(text));
  if (found) return found[0];
  return amount < 400 ? "hour" : "year";
}

// Sensible bounds for a new-grad role in each period; anything outside isn't a pay range.
const BOUNDS: Record<SalaryPeriod, [number, number]> = {
  hour: [12, 300],
  week: [400, 20_000],
  month: [1_500, 80_000],
  year: [25_000, 900_000],
};

function toNumber(value: string, thousands: string | undefined) {
  const number = Number(value.replace(/,/g, ""));
  return thousands ? number * 1000 : number;
}

export function parseSalary(text: string): SalaryRange | null {
  for (const match of text.matchAll(RANGE)) {
    const [whole, symbol, minText, minK, maxText, maxK] = match;
    // "$120-150K" puts the K only on the second number.
    let min = toNumber(minText, minK ?? (maxK && !minText.includes(",") ? maxK : undefined));
    let max = toNumber(maxText, maxK);
    if (min > max) [min, max] = [max, min];

    const after = text.slice((match.index ?? 0) + whole.length, (match.index ?? 0) + whole.length + 20);
    const context = text.slice(Math.max(0, (match.index ?? 0) - 40), (match.index ?? 0) + whole.length + 40);
    const currency = /CA\$|C\$|CAD/.test(symbol + context) ? "CAD" : "USD";
    const period = periodFrom(after, max);

    // Skip things that look like money but aren't a pay range (fees, bonuses, funding).
    const [low, high] = BOUNDS[period];
    if (min >= low && max <= high && max / min <= 3) return { min, max, currency, period };
  }
  return null;
}

function compact(value: number, period: SalaryPeriod) {
  if (period === "hour") return `${Math.round(value)}`;
  if (value < 1000) return `${Math.round(value)}`;
  const thousands = value / 1000;
  return `${thousands >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10}K`;
}

export function formatSalary(range: SalaryRange) {
  const symbol = range.currency === "CAD" ? "CA$" : "$";
  const amounts =
    range.min === range.max
      ? `${symbol}${compact(range.min, range.period)}`
      : `${symbol}${compact(range.min, range.period)} - ${symbol}${compact(range.max, range.period)}`;
  const suffix = { hour: "hr", week: "wk", month: "mo", year: "yr" }[range.period];
  return `${amounts}/${suffix}`;
}
