export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchJobDescription, InvalidJobUrlError } from "@/lib/keywords/jobText";
import { matchResume } from "@/lib/keywords/match";

const MIN_JOB_TEXT = 100;

// Scores a saved resume against a job description given as a link or pasted text.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const resumeId = String(body.resumeId ?? "");
  const jobUrl = String(body.jobUrl ?? "").trim();
  let jobText = String(body.jobText ?? "").trim();
  let jobTitle: string | null = null;
  let company: string | null = null;

  const resume = resumeId
    ? await prisma.resume.findUnique({ where: { id: resumeId }, select: { id: true, name: true, text: true } })
    : null;
  if (!resume) return NextResponse.json({ error: "Choose a resume first." }, { status: 400 });

  if (!jobText && jobUrl) {
    try {
      const fetched = await fetchJobDescription(jobUrl);
      jobText = fetched.text;
      jobTitle = fetched.title;
      company = fetched.company;
    } catch (error) {
      if (error instanceof InvalidJobUrlError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      const reason = error instanceof Error ? error.message : "The page couldn't be loaded.";
      return NextResponse.json(
        { error: `${reason} Some sites block automatic reading; paste the description text instead.` },
        { status: 400 }
      );
    }
  }

  if (jobText.length < MIN_JOB_TEXT) {
    return NextResponse.json(
      { error: jobUrl ? "That page didn't include a readable job description. Paste the text instead." : "Paste the full job description." },
      { status: 400 }
    );
  }

  const result = await matchResume(resume.text, jobText, body.useAi === true, company);
  if (result.keywords.length === 0) {
    return NextResponse.json(
      { error: "No skills or tools were found in that job description." },
      { status: 422 }
    );
  }

  return NextResponse.json({
    ...result,
    resume: { id: resume.id, name: resume.name },
    job: { title: jobTitle, url: jobUrl || null },
  });
}
