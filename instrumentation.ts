// Runs once when the Next.js server starts (for example `pnpm dev`), so the job feed's
// sources are already downloaded by the time the Job feed page is opened.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getJobFeed } = await import("@/lib/jobFeed");
  getJobFeed()
    .then(({ jobs, sources }) => {
      const perSource = sources
        .map((source) => `${source.name} ${source.error && !source.count ? "failed" : source.count}`)
        .join(", ");
      console.log(`Job feed: ${jobs.length} US/Canada new-grad openings from the last 7 days (${perSource}).`);
    })
    .catch((error) => console.warn(`Job feed: couldn't load openings (${error.message}).`));
}
