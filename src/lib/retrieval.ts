import { prisma } from "@/lib/db";
import { cosineSimilarity, createEmbeddings, parseEmbedding } from "@/lib/rag";

const DEFAULT_MATCHES = 5;

// Thrown when the application has nothing usable to retrieve; routes report it as a 400.
export class ContextUnavailableError extends Error {}

export type RetrievedMatch = {
  id: string;
  score: number;
  content: string;
  sourceType: string;
  title: string;
  url: string | null;
};

export async function retrieveContext(
  applicationId: string,
  query: string,
  limit = DEFAULT_MATCHES
): Promise<RetrievedMatch[]> {
  const chunks = await prisma.documentChunk.findMany({
    where: { applicationId },
    include: {
      document: {
        select: { sourceType: true, title: true, url: true },
      },
    },
  });

  if (chunks.length === 0) {
    throw new ContextUnavailableError(
      "No synced context exists yet. Sync application context first."
    );
  }

  const [queryEmbedding = []] = await createEmbeddings([query]);

  const comparable = chunks
    .map((chunk) => ({ chunk, embedding: parseEmbedding(chunk.embedding) }))
    .filter(({ embedding }) => embedding.length === queryEmbedding.length);

  // Chunks embedded by another provider have a different vector size and can't be compared.
  if (comparable.length === 0) {
    throw new ContextUnavailableError(
      "This application's context was synced with a different embedding model. Click Sync context again."
    );
  }

  return comparable
    .map(({ chunk, embedding }) => ({
      id: chunk.id,
      score: Number(cosineSimilarity(queryEmbedding, embedding).toFixed(4)),
      content: chunk.content,
      sourceType: chunk.document.sourceType,
      title: chunk.document.title,
      url: chunk.document.url,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function matchLabel(match: RetrievedMatch) {
  return match.url
    ? `${match.sourceType} | ${match.title} | ${match.url}`
    : `${match.sourceType} | ${match.title}`;
}
