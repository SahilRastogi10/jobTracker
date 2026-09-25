// Runs once when the Next.js server starts (for example `pnpm dev`), so the job feed's
// sources are already downloaded by the time the Job feed page is opened.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getJobFeed } = await import("@/lib/jobFeed");
  const { attachSalaries } = await import("@/lib/salary/enrich");
  getJobFeed()
    .then(async ({ jobs, sources }) => {
      // Start the background salary lookups so they're ready when the page opens.
      const { pending } = await attachSalaries(jobs);
      if (pending > 0) console.log(`Job feed: looking up ${pending} salaries in the background.`);
      const perSource = sources
        .map((source) => `${source.name} ${source.error && !source.count ? "failed" : source.count}`)
        .join(", ");
      console.log(`Job feed: ${jobs.length} US/Canada new-grad openings from the last 7 days (${perSource}).`);
    })
    .catch((error) => console.warn(`Job feed: couldn't load openings (${error.message}).`));
}
