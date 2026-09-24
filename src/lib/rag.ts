const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_OPENAI_RESPONSE_MODEL = "gpt-5.4-mini";
const DEFAULT_OLLAMA_EMBEDDING_MODEL = "nomic-embed-text";
const DEFAULT_OLLAMA_RESPONSE_MODEL = "qwen3:8b";
const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 200;

type RagProvider = "openai" | "ollama";

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

export function getRagProvider(): RagProvider {
  return process.env.RAG_PROVIDER?.toLowerCase() === "openai" ? "openai" : "ollama";
}

function getApiBaseUrl() {
  return getRagProvider() === "ollama"
    ? process.env.OLLAMA_BASE_URL ?? OLLAMA_BASE_URL
    : process.env.OPENAI_BASE_URL ?? OPENAI_BASE_URL;
}

function getApiKey() {
  if (getRagProvider() === "ollama") {
    return process.env.OLLAMA_API_KEY?.trim() || null;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY for RAG_PROVIDER=openai.");
  }

  return apiKey;
}

function getEmbeddingModel() {
  return getRagProvider() === "ollama"
    ? process.env.OLLAMA_RAG_EMBEDDING_MODEL ?? DEFAULT_OLLAMA_EMBEDDING_MODEL
    : process.env.OPENAI_RAG_EMBEDDING_MODEL ?? DEFAULT_OPENAI_EMBEDDING_MODEL;
}

export function getResponseModel() {
  return getRagProvider() === "ollama"
    ? process.env.OLLAMA_RAG_RESPONSE_MODEL ?? DEFAULT_OLLAMA_RESPONSE_MODEL
    : process.env.OPENAI_RAG_RESPONSE_MODEL ?? DEFAULT_OPENAI_RESPONSE_MODEL;
}

function getReasoningEffort() {
  return process.env.OPENAI_RAG_REASONING_EFFORT ?? "low";
}

async function ragRequest<T>(path: string, body: Record<string, unknown>) {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers,
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
        : `RAG provider request failed with status ${res.status}.`;
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

  const data = await ragRequest<OpenAIEmbeddingsResult>("/embeddings", {
    model: getEmbeddingModel(),
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

// Reasoning models served through Ollama can leak their thinking into the text.
function stripThinking(value: string) {
  return value.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

type ContextBlock = {
  label: string;
  text: string;
};

function formatContextBlocks(contextBlocks: ContextBlock[]) {
  return contextBlocks
    .map((block, index) => `[${index + 1}] ${block.label}\n${block.text}`)
    .join("\n\n");
}

export async function generateText(systemPrompt: string, userPrompt: string) {
  const body: Record<string, unknown> = {
    model: getResponseModel(),
    instructions: systemPrompt,
    input: userPrompt,
  };

  if (getRagProvider() === "openai") {
    body.reasoning = {
      effort: getReasoningEffort(),
    };
  }

  const data = await ragRequest<OpenAIResponsesResult>("/responses", body);

  const text = stripThinking(extractOutputText(data));
  if (!text) {
    throw new Error("The model did not return a text answer.");
  }

  return text;
}

export async function answerWithRetrievedContext(
  question: string,
  contextBlocks: ContextBlock[]
) {
  const systemPrompt =
    "You answer questions about a saved job application using only the supplied context. Be precise, keep claims grounded in the sources, and say when the context is incomplete. When you use a source, cite it inline like [1] or [2].";

  return generateText(
    systemPrompt,
    `Question: ${question}\n\nContext:\n${formatContextBlocks(contextBlocks)}`
  );
}

export async function draftFollowUpMessage(
  details: string,
  channel: string,
  contextBlocks: ContextBlock[]
) {
  // Describe only the requested format; listing both makes small models write both.
  const format =
    channel === "linkedin"
      ? "Write a single LinkedIn message body under 80 words, with no subject line."
      : "Write a single email: a line 'Subject: ...', a blank line, then the body, under 150 words.";

  const systemPrompt = [
    "You draft a short follow-up message from a job applicant to a recruiter or hiring team.",
    "Use only facts from the application details and context. Never invent names, dates, interviews, or accomplishments; if something is unknown, leave it out.",
    "Keep it warm and specific to the role.",
    format,
    "Greet the recipient by first name if one is given; otherwise open with 'Hello,'.",
    "Sign off with the applicant's name if it is given; otherwise end with 'Best,' and no name.",
    "Do not include citation markers, bracketed placeholders, alternative versions, or commentary about the draft.",
  ].join(" ");

  const text = await generateText(
    systemPrompt,
    `Application details:\n${details}\n\nContext:\n${formatContextBlocks(contextBlocks)}`
  );

  // Small local models still emit "[Your Name]" lines and notes about them; drop those lines.
  return text
    .split("\n")
    .filter((line) => !/^\s*\[[^\]]*\]\s*$/.test(line) && !/^\s*\*?\(Note:/i.test(line))
    .join("\n")
    .trim();
}
