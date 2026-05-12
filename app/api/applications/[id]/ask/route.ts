export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  answerWithRetrievedContext,
  cosineSimilarity,
  createEmbeddings,
  parseEmbedding,
} from "@/lib/rag";

const MAX_MATCHES = 5;

function getIdFromUrl(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const appIndex = parts.findIndex((part) => part === "applications");
  const id = appIndex >= 0 ? parts[appIndex + 1] : null;
  return id ? id : null;
}

function formatDocumentLabel(document: { title: string; sourceType: string; url: string | null }) {
  return document.url
    ? `${document.sourceType} | ${document.title} | ${document.url}`
    : `${document.sourceType} | ${document.title}`;
}

export async function POST(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const application = await prisma.application.findUnique({
    where: { id },
    select: { id: true, company: true, role: true },
  });

  if (!application) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim();

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const chunks = await prisma.documentChunk.findMany({
    where: { applicationId: id },
    include: {
      document: {
        select: {
          id: true,
          sourceType: true,
          title: true,
          url: true,
        },
      },
    },
  });

  if (chunks.length === 0) {
    return NextResponse.json(
      { error: "No synced context exists yet. Sync application context first." },
      { status: 400 }
    );
  }

  try {
    const [queryEmbedding] = await createEmbeddings([question]);
    const rankedMatches = chunks
      .map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
        score: cosineSimilarity(queryEmbedding ?? [], parseEmbedding(chunk.embedding)),
        document: chunk.document,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_MATCHES);

    const answer = await answerWithRetrievedContext(
      `Application: ${application.company} | ${application.role}\n${question}`,
      rankedMatches.map((match) => ({
        label: formatDocumentLabel(match.document),
        text: match.content,
      }))
    );

    return NextResponse.json({
      answer,
      matches: rankedMatches.map((match) => ({
        id: match.id,
        score: Number(match.score.toFixed(4)),
        content: match.content,
        sourceType: match.document.sourceType,
        title: match.document.title,
        url: match.document.url,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not answer the question.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
