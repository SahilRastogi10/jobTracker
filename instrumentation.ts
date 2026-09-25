// Runs once when the Next.js server starts (for example `pnpm dev`), so the new-grad job
// feed is already downloaded by the time the Job feed page is opened.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getJobFeed } = await import("@/lib/jobFeed");
  getJobFeed()
    .then(({ jobs }) => console.log(`Job feed: loaded ${jobs.length} new-grad openings from the last 7 days.`))
    .catch((error) => console.warn(`Job feed: couldn't load openings (${error.message}).`));
}
