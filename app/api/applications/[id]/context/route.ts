export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { DocumentSourceType, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchJobPostingContent } from "@/lib/jobContent";
import { chunkText, createEmbeddings, serializeEmbedding } from "@/lib/rag";

function getIdFromUrl(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const appIndex = parts.findIndex((part) => part === "applications");
  const id = appIndex >= 0 ? parts[appIndex + 1] : null;
  return id ? id : null;
}

function compactLines(values: Array<string | null | undefined>) {
  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function buildProfileContent(application: {
  company: string;
  role: string;
  stage: string;
  dateApplied: string;
  followUpDate: string | null;
  link: string | null;
}) {
  return [
    `Company: ${application.company}`,
    `Role: ${application.role}`,
    `Stage: ${application.stage}`,
    `Applied date: ${application.dateApplied}`,
    application.followUpDate ? `Follow-up date: ${application.followUpDate}` : null,
    application.link ? `Job link: ${application.link}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRecruiterContent(application: {
  recruiterName: string | null;
  recruiterTitle: string | null;
  recruiterEmail: string | null;
  recruiterLinkedIn: string | null;
  recruiterSource: string | null;
}) {
  const lines = compactLines([
    application.recruiterName ? `Recruiter name: ${application.recruiterName}` : null,
    application.recruiterTitle ? `Recruiter title: ${application.recruiterTitle}` : null,
    application.recruiterEmail ? `Recruiter email: ${application.recruiterEmail}` : null,
    application.recruiterLinkedIn
      ? `Recruiter profile: ${application.recruiterLinkedIn}`
      : null,
    application.recruiterSource ? `Source notes: ${application.recruiterSource}` : null,
  ]);

  return lines.join("\n");
}

async function buildDocumentPayloads(application: {
  id: string;
  company: string;
  role: string;
  stage: string;
  dateApplied: string;
  followUpDate: string | null;
  link: string | null;
  notes: string | null;
  recruiterName: string | null;
  recruiterTitle: string | null;
  recruiterEmail: string | null;
  recruiterLinkedIn: string | null;
  recruiterSource: string | null;
}) {
  const warnings: string[] = [];
  const documents: Array<{
    sourceType: DocumentSourceType;
    title: string;
    url: string | null;
    content: string;
  }> = [
    {
      sourceType: DocumentSourceType.APPLICATION_PROFILE,
      title: `${application.company} | ${application.role}`,
      url: application.link ?? null,
      content: buildProfileContent(application),
    },
  ];

  const notes = String(application.notes ?? "").trim();
  if (notes) {
    documents.push({
      sourceType: DocumentSourceType.APPLICATION_NOTES,
      title: "Application notes",
      url: null,
      content: notes,
    });
  }

  const recruiterContext = buildRecruiterContent(application);
  if (recruiterContext) {
    documents.push({
      sourceType: DocumentSourceType.RECRUITER_CONTEXT,
      title: "Recruiter context",
      url: application.recruiterLinkedIn ?? application.link ?? null,
      content: recruiterContext,
    });
  }

  const link = String(application.link ?? "").trim();
  if (link) {
    try {
      const jobPosting = await fetchJobPostingContent(link);
      documents.push({
        sourceType: DocumentSourceType.JOB_POSTING,
        title: jobPosting.title,
        url: link,
        content: jobPosting.content,
      });
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : "The job posting could not be fetched."
      );
    }
  }

  return { documents, warnings };
}

async function prepareChunkPayloads(
  documents: Array<{
    sourceType: DocumentSourceType;
    title: string;
    url: string | null;
    content: string;
  }>
) {
  const prepared: Array<{
    sourceType: DocumentSourceType;
    title: string;
    url: string | null;
    content: string;
    chunks: Array<{
      chunkIndex: number;
      content: string;
      embedding: string;
    }>;
  }> = [];

  for (const document of documents) {
    const chunkTexts = chunkText(document.content);
    const embeddings = chunkTexts.length > 0 ? await createEmbeddings(chunkTexts) : [];

    prepared.push({
      ...document,
      chunks: chunkTexts.map((content, chunkIndex) => ({
        chunkIndex,
        content,
        embedding: serializeEmbedding(embeddings[chunkIndex] ?? []),
      })),
    });
  }

  return prepared;
}

async function loadContextStatus(applicationId: string) {
  const documents = await prisma.applicationDocument.findMany({
    where: { applicationId },
    include: {
      _count: {
        select: { chunks: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return {
    documentCount: documents.length,
    chunkCount: documents.reduce((sum, document) => sum + document._count.chunks, 0),
    lastSyncedAt: documents[0]?.updatedAt.toISOString() ?? null,
    documents: documents.map((document) => ({
      id: document.id,
      sourceType: document.sourceType,
      title: document.title,
      url: document.url,
      updatedAt: document.updatedAt.toISOString(),
      chunkCount: document._count.chunks,
    })),
  };
}

export async function GET(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const application = await prisma.application.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!application) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const status = await loadContextStatus(id);
  return NextResponse.json({ status });
}

export async function POST(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const application = await prisma.application.findUnique({
    where: { id },
    select: {
      id: true,
      company: true,
      role: true,
      stage: true,
      dateApplied: true,
      followUpDate: true,
      link: true,
      notes: true,
      recruiterName: true,
      recruiterTitle: true,
      recruiterEmail: true,
      recruiterLinkedIn: true,
      recruiterSource: true,
    },
  });

  if (!application) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { documents, warnings } = await buildDocumentPayloads(application);
    const preparedDocuments = await prepareChunkPayloads(documents);
    const desiredSourceTypes = new Set(
      preparedDocuments.map((document) => document.sourceType)
    );

    await prisma.$transaction(async (tx) => {
      const removableTypes: DocumentSourceType[] = [
        DocumentSourceType.APPLICATION_NOTES,
        DocumentSourceType.RECRUITER_CONTEXT,
      ];

      if (!String(application.link ?? "").trim()) {
        removableTypes.push(DocumentSourceType.JOB_POSTING);
      }

      for (const sourceType of removableTypes) {
        if (desiredSourceTypes.has(sourceType)) continue;

        await tx.applicationDocument.deleteMany({
          where: {
            applicationId: id,
            sourceType,
          },
        });
      }

      for (const document of preparedDocuments) {
        const savedDocument = await tx.applicationDocument.upsert({
          where: {
            applicationId_sourceType: {
              applicationId: id,
              sourceType: document.sourceType,
            },
          },
          update: {
            title: document.title,
            url: document.url,
            content: document.content,
            lastSyncedAt: new Date(),
          },
          create: {
            applicationId: id,
            sourceType: document.sourceType,
            title: document.title,
            url: document.url,
            content: document.content,
            lastSyncedAt: new Date(),
          },
        });

        await tx.documentChunk.deleteMany({
          where: { documentId: savedDocument.id },
        });

        if (document.chunks.length > 0) {
          await tx.documentChunk.createMany({
            data: document.chunks.map((chunk) => ({
              documentId: savedDocument.id,
              applicationId: id,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              embedding: chunk.embedding,
            })),
          });
        }
      }
    });

    const status = await loadContextStatus(id);
    return NextResponse.json({ status, warnings });
  } catch (error) {
    const message =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not sync application context.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
