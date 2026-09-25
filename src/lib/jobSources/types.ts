export type FeedJob = {
  id: string;
  company: string;
  title: string;
  url: string;
  locations: string[];
  category: string;
  sponsorship: string | null;
  degrees: string[];
  salary: string | null;
  postedAt: number; // epoch milliseconds
  // Some sources only give a day count ("3d"), so the time of day is unknown.
  postedApprox: boolean;
  // Every source that listed this job, after duplicates are merged.
  sources: string[];
};

export type SourceResult = {
  source: string;
  jobs: FeedJob[];
  error?: string;
};

// Title keywords used to sort jobs from sources that don't label a category.
export function inferCategory(title: string) {
  if (/\b(quant|trading|trader)\b/i.test(title)) return "Quant";
  if (/\bproduct manag/i.test(title)) return "Product";
  if (/\b(hardware|electrical|embedded|firmware|asic|fpga|silicon|circuit)\b/i.test(title)) {
    return "Hardware";
  }
  if (/\b(data|machine learning|ml|ai|analytics|analyst|scientist)\b/i.test(title)) {
    return "AI/ML/Data";
  }
  return "Software";
}
