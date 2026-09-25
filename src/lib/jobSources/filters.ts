// Location and seniority checks shared by every job source.

const US_STATES =
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR".split(" ");
const CA_PROVINCES = "AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" ");
const REGION_NAMES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware",
  "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
  "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico",
  "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
  "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west virginia", "wisconsin", "wyoming", "district of columbia",
  "alberta", "british columbia", "manitoba", "new brunswick", "newfoundland", "nova scotia",
  "ontario", "prince edward island", "quebec", "québec", "saskatchewan", "yukon",
];
// Cities that listings often name without a state ("SF", "NYC", "Seattle").
const CITIES = [
  "sf", "nyc", "la", "san francisco", "new york city", "seattle", "boston", "austin", "chicago",
  "los angeles", "san jose", "palo alto", "mountain view", "menlo park", "sunnyvale", "redmond",
  "bellevue", "denver", "atlanta", "miami", "dallas", "houston", "philadelphia", "pittsburgh",
  "san diego", "salt lake city", "washington dc", "bay area", "silicon valley", "toronto",
  "vancouver", "montreal", "montréal", "waterloo", "ottawa", "calgary", "edmonton",
];

const COUNTRY = /\b(usa|u\.s\.a?\.?|united states|america|canada)\b/i;
const COUNTRY_CODE = /(^|[\s,(-])(US|CA)($|[\s,)-])/;
const STATE_CODE = new RegExp(`(^|,\\s*|\\s)(${[...US_STATES, ...CA_PROVINCES].join("|")})(\\s*\\d{5})?$`);
const REGION = new RegExp(`\\b(${REGION_NAMES.join("|")})\\b`, "i");
const CITY = new RegExp(`^(remote\\s*[-,(]?\\s*)?(${CITIES.join("|")})\\b`, "i");
const REMOTE_WORDS = /\b(remote|anywhere|distributed|hybrid|flexible|work from home|wfh)\b/gi;

function isUsOrCanadaLocation(location: string) {
  const value = location.trim();
  return (
    COUNTRY.test(value) ||
    COUNTRY_CODE.test(value) ||
    STATE_CODE.test(value) ||
    REGION.test(value) ||
    CITY.test(value)
  );
}

// True for "Remote" or "Remote / Hybrid", but not "Remote - Poland" or "Ukraine Anywhere".
function isBareRemote(location: string) {
  const rest = location.replace(REMOTE_WORDS, "").replace(/[\s\-,()/|]+/g, "");
  return rest === "" && location.trim() !== "";
}

// Keeps a job if any location is in the US or Canada. A bare "Remote" with no country
// is kept too, since most remote listings on these sources are US-based.
export function inUsOrCanada(locations: string[]) {
  const cleaned = locations.map((location) => location.trim()).filter(Boolean);
  if (cleaned.length === 0) return false;
  if (cleaned.some(isUsOrCanadaLocation)) return true;
  return cleaned.every(isBareRemote);
}

const ENTRY_LEVEL =
  /\b(new grad|new graduate|graduate|university|college|campus|entry[- ]level|early[- ]career|junior|jr\.?|associate|apprentice|residency|rotational|(engineer|developer|analyst|scientist)\s*(i|1)\b)/i;
const NOT_ENTRY_LEVEL =
  /\b(senior|sr\.?|staff|principal|lead|manager|director|head|vp|architect|intern|internship|co-?op|ii|iii|iv|2|3|phd)\b/i;

// Company boards list every role, so also require a technical one; "associate" alone would
// otherwise let in sales, legal, and recruiting jobs.
const TECH_ROLE =
  /\b(engineer|engineering|developer|software|swe|sde|programmer|data|machine learning|ml|ai|scientist|research|quant|product manager|apm|designer|security|sre|devops|infrastructure|platform|cloud|hardware|firmware|embedded)\b/i;
const NON_TECH_ROLE =
  /\b(recruit\w*|talent|sales|account executive|counsel|legal|attorney|paralegal|compliance|marketing|finance|accounting|billing|people|hr|customer success|executive assistant)\b/i;

// For company job boards and search results, which list every opening, not just new-grad ones.
export function isEntryLevelTitle(title: string) {
  // "Associate Product Manager" is an entry-level role despite the word "manager".
  const withoutPm = title.replace(/product manager/gi, "product");
  return (
    ENTRY_LEVEL.test(title) &&
    !NOT_ENTRY_LEVEL.test(withoutPm) &&
    TECH_ROLE.test(title) &&
    !NON_TECH_ROLE.test(title)
  );
}
