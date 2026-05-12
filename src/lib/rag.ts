const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_RESPONSE_MODEL = "gpt-5.4-mini";
const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 200;

type ResponsesContentItem = {
  type?: string;
  text?: string;
};

type ResponsesOutputItem = {
  content?: ResponsesContentItem[];
};

type OpenAIResponsesResult = {
  output_text?: string;
  output?: ResponsesOutputItem[];
  error?: {
    message?: string;
  };
};

type OpenAIEmbeddingsResult = {
  data?: Array<{
    embedding?: number[];
  }>;
  error?: {
    message?: string;
  };
};

function requireApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  return apiKey;
}

async function openAIRequest<T>(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${OPENAI_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };

  if (!res.ok) {
    const message =
      typeof data?.error?.message === "string"
        ? data.error.message
        : `OpenAI request failed with status ${res.status}.`;
    throw new Error(message);
  }

  return data;
}

export function chunkText(
  value: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  chunkOverlap = DEFAULT_CHUNK_OVERLAP
) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + chunkSize);
    const slice = normalized.slice(start, end).trim();

    if (slice) {
      chunks.push(slice);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - chunkOverlap, start + 1);
  }

  return chunks;
}

export function serializeEmbedding(value: number[]) {
  return JSON.stringify(value);
}

export function parseEmbedding(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export async function createEmbeddings(inputs: string[]) {
  if (inputs.length === 0) return [];

  const data = await openAIRequest<OpenAIEmbeddingsResult>("/embeddings", {
    model: process.env.OPENAI_RAG_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
    input: inputs,
  });

  return (data.data ?? []).map((item) => item.embedding ?? []);
}

function extractOutputText(result: OpenAIResponsesResult) {
  if (typeof result.output_text === "string" && result.output_text.trim()) {
    return result.output_text.trim();
  }

  const combined = (result.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" || item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n")
    .trim();

  return combined;
}

export async function answerWithRetrievedContext(
  question: string,
  contextBlocks: Array<{
    label: string;
    text: string;
  }>
) {
  const context = contextBlocks
    .map(
      (block, index) =>
        `[${index + 1}] ${block.label}\n${block.text}`
    )
    .join("\n\n");

  const systemPrompt =
    "You answer questions about a saved job application using only the supplied context. Be precise, keep claims grounded in the sources, and say when the context is incomplete. When you use a source, cite it inline like [1] or [2].";

  const userPrompt = `Question: ${question}\n\nContext:\n${context}`;

  const data = await openAIRequest<OpenAIResponsesResult>("/responses", {
    model: process.env.OPENAI_RAG_RESPONSE_MODEL ?? DEFAULT_RESPONSE_MODEL,
    reasoning: {
      effort: process.env.OPENAI_RAG_REASONING_EFFORT ?? "low",
    },
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }],
      },
    ],
  });

  const answer = extractOutputText(data);
  if (!answer) {
    throw new Error("The model did not return a text answer.");
  }

  return answer;
}
