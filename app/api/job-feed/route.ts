export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeJobUrl } from "@/lib/extension";
import { getJobFeed } from "@/lib/jobFeed";

const WINDOWS = { "24h": 24 * 60 * 60 * 1000, "7d": 7 * 24 * 60 * 60 * 1000 } as const;

// New-grad openings posted in the last 24 hours or 7 days, marked when already in the tracker.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const window = searchParams.get("window") === "24h" ? "24h" : "7d";

  // Each source reports its own errors, so one failing never blocks the others.
  const feed = await getJobFeed({ refresh: searchParams.get("refresh") === "1" });

  const cutoff = Date.now() - WINDOWS[window];
  const jobs = feed.jobs.filter((job) => job.postedAt >= cutoff);

  // Match against saved applications by job link, or by company and role.
  const applications = await prisma.application.findMany({
    select: { id: true, company: true, role: true, link: true },
  });
  const byLink = new Map<string, string>();
  const byCompanyRole = new Map<string, string>();
  for (const application of applications) {
    const link = normalizeJobUrl(application.link);
    if (link) byLink.set(link, application.id);
    byCompanyRole.set(`${application.company}|${application.role}`.toLowerCase(), application.id);
  }

  const items = jobs.map((job) => ({
    ...job,
    applicationId:
      byLink.get(normalizeJobUrl(job.url) ?? "") ??
      byCompanyRole.get(`${job.company}|${job.title}`.toLowerCase()) ??
      null,
  }));

  return NextResponse.json({
    window,
    items,
    fetchedAt: feed.fetchedAt,
    counts: {
      "24h": feed.jobs.filter((job) => job.postedAt >= Date.now() - WINDOWS["24h"]).length,
      "7d": feed.jobs.filter((job) => job.postedAt >= Date.now() - WINDOWS["7d"]).length,
    },
    sources: feed.sources,
    jsearchAvailable: feed.jsearchAvailable,
  });
}
