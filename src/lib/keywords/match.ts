import { generateQuickText } from "@/lib/rag";
import { SKILLS, type Skill, type SkillCategory } from "@/lib/keywords/skills";

export type KeywordImportance = "required" | "preferred" | "mentioned";

export type Keyword = {
  name: string;
  category: SkillCategory | "other";
  importance: KeywordImportance;
  matched: boolean;
  // Found by the local model rather than the built-in list; counts less toward the score.
  extra?: boolean;
};

export type MatchResult = {
  score: number;
  keywords: Keyword[];
  usedAi: boolean;
  // The model step was requested but didn't finish (timeout, Ollama not running).
  aiFailed: boolean;
};

// Required skills count the most; skills only listed as "preferred" count the least.
const WEIGHTS: Record<KeywordImportance, number> = { required: 3, mentioned: 2, preferred: 1 };
// Local models on a CPU can be slow; past this the dictionary result is used on its own.
const AI_TIMEOUT_MS = 120_000;
// Model suggestions made only of these words are noise ("Backend services", "Platform").
const GENERIC_WORDS = new Set(
  "a an and or of the to for with in on build building services service platform platforms system systems software engineering engineer engineers backend frontend full stack senior junior team teams role product products professional work working development developer tools tool strong solid knowledge understanding".split(
    " "
  )
);

const REQUIRED_HEADING =
  /\b(requirements?|qualifications?|what you('ll| will)? (need|bring)|must[- ]haves?|you (have|bring)|basic|minimum|required|who you are|what we('re| are) looking for|about you|skills)\b/i;
const PREFERRED_HEADING =
  /\b(preferred|nice[- ]to[- ]haves?|bonus|pluses|desired|good to have|would be great|extra credit)\b/i;
const OTHER_HEADING =
  /\b(responsibilities|what you('ll| will) do|about (us|the (role|team|company|job))|benefits|perks|compensation|salary|overview|the role|our team|who we are|why join)\b/i;
// "Kafka experience is a plus" inside a requirements list still reads as preferred.
const INLINE_PREFERRED = /\b(is a plus|a plus|preferred|nice to have|bonus|good to have|desirable)\b/i;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word boundaries that also work for names like "C++", ".NET", and "CI/CD".
function termPattern(term: string, caseSensitive = false) {
  let body = escapeRegex(term.trim()).replace(/(?:\\-|\s)+/g, "[\\s-]*");
  if (/[a-z]$/i.test(term)) body += "(?:s|es)?";
  return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9+#])`, caseSensitive ? "" : "i");
}

const skillPatterns = new Map<Skill, RegExp[]>(
  SKILLS.map((skill) => [
    skill,
    [skill.name, ...(skill.aliases ?? [])].map((term) => termPattern(term, skill.caseSensitive)),
  ])
);

function matchesSkill(text: string, skill: Skill) {
  return skillPatterns.get(skill)!.some((pattern) => pattern.test(text));
}

type Section = "required" | "preferred" | "other";

function lineSections(text: string) {
  let current: Section = "other";

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const isHeading = line.length <= 70 && (line.endsWith(":") || !/[.!?]$/.test(line));
      if (isHeading) {
        if (PREFERRED_HEADING.test(line)) current = "preferred";
        else if (REQUIRED_HEADING.test(line)) current = "required";
        else if (OTHER_HEADING.test(line)) current = "other";
      }
      const section: Section = INLINE_PREFERRED.test(line) ? "preferred" : current;
      return { line, section };
    });
}

function importanceOf(lines: Array<{ line: string; section: Section }>, test: (line: string) => boolean) {
  const sections = lines.filter(({ line }) => test(line)).map(({ section }) => section);
  if (sections.includes("required")) return "required";
  if (sections.includes("other")) return "mentioned";
  return "preferred";
}

// Asks the local model for job-specific terms the dictionary doesn't know.
// Anything it returns that isn't literally in the description is dropped.
async function extractExtraTerms(jobText: string) {
  const systemPrompt = [
    "You extract keywords from a job description for resume matching.",
    "Return only a JSON array of strings, nothing else.",
    "Include only named technologies a recruiter would search for: programming languages, frameworks, libraries, tools, platforms, cloud services, protocols, and certifications.",
    "Skip ordinary nouns and phrases (billing, performance, privacy, logs, edge cases, providers, product design), soft skills, job titles, benefits, locations, and company names.",
    "Copy each keyword exactly as written in the description, 1 to 3 words each. At most 20 items.",
  ].join(" ");

  const raw = await generateQuickText(
    systemPrompt,
    // Most of the time on a CPU goes to reading the input, so keep it to the core description.
    jobText.slice(0, 6000),
    AbortSignal.timeout(AI_TIMEOUT_MS)
  );
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];

  const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

// The hiring company's own name ("Vercel" at Vercel) isn't a skill to match.
function isCompanyName(term: string, company: string | null) {
  if (!company) return false;
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalize(term) === normalize(company);
}

export async function matchResume(
  resumeText: string,
  jobText: string,
  useAi: boolean,
  company: string | null = null
): Promise<MatchResult> {
  const lines = lineSections(jobText);
  const keywords: Keyword[] = [];
  const seen = new Set<string>();

  for (const skill of SKILLS) {
    if (isCompanyName(skill.name, company) || !matchesSkill(jobText, skill)) continue;
    keywords.push({
      name: skill.name,
      category: skill.category,
      importance: importanceOf(lines, (line) => matchesSkill(line, skill)),
      matched: matchesSkill(resumeText, skill),
    });
    seen.add(skill.name.toLowerCase());
  }

  let usedAi = false;
  if (useAi) {
    try {
      const terms = await extractExtraTerms(jobText);
      usedAi = true;

      for (const rawTerm of terms) {
        const term = rawTerm.replace(/\s+/g, " ").trim();
        if (term.length < 2 || term.length > 40 || seen.has(term.toLowerCase())) continue;
        if (isCompanyName(term, company)) continue;
        // Named technologies are written with a capital, digit, or symbol ("AI SDK", "C#", "S3");
        // all-lowercase phrases like "edge cases" are ordinary words.
        if (!/[A-Z0-9+#./]/.test(term)) continue;
        const words = term.toLowerCase().split(/[\s/-]+/);
        if (words.length > 4 || /experience|years?\b/i.test(term)) continue;
        if (words.every((word) => GENERIC_WORDS.has(word))) continue;
        // Terms the dictionary already knows under another spelling are handled above.
        if (SKILLS.some((skill) => matchesSkill(term, skill))) continue;

        const pattern = termPattern(term);
        if (!pattern.test(jobText)) continue;

        keywords.push({
          name: term,
          category: "other",
          importance: importanceOf(lines, (line) => pattern.test(line)),
          matched: pattern.test(resumeText),
          extra: true,
        });
        seen.add(term.toLowerCase());
      }
    } catch {
      // The model is optional; the dictionary result still stands.
      usedAi = false;
    }
  }

  // Extra terms from the model count once, so an off guess can't outweigh the built-in list.
  const weightOf = (keyword: Keyword) => (keyword.extra ? 1 : WEIGHTS[keyword.importance]);
  const total = keywords.reduce((sum, keyword) => sum + weightOf(keyword), 0);
  const earned = keywords
    .filter((keyword) => keyword.matched)
    .reduce((sum, keyword) => sum + weightOf(keyword), 0);

  return {
    score: total > 0 ? Math.round((earned / total) * 100) : 0,
    keywords,
    usedAi,
    aiFailed: useAi && !usedAi,
  };
}
