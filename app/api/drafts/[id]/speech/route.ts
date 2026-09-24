export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { finalDraftText } from "@/lib/drafts";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
// "George", one of ElevenLabs' default voices; set ELEVENLABS_VOICE_ID to use another.
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
// Multilingual model so Spanish drafts are read with Spanish pronunciation.
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
// Drafts are short; the cap keeps a runaway draft from using the monthly quota.
const MAX_CHARACTERS = 2500;

function getIdFromUrl(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const draftIndex = parts.findIndex((part) => part === "drafts");
  const id = draftIndex >= 0 ? parts[draftIndex + 1] : null;
  return id ? id : null;
}

// Reading a draft aloud is part of reviewing it, so any status is allowed.
export async function POST(req: Request) {
  const id = getIdFromUrl(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Set ELEVENLABS_API_KEY in .env to use Listen." },
      { status: 400 }
    );
  }

  const draft = await prisma.generatedDraft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const text = finalDraftText(draft)
    .replace(/^Subject:\s*/i, "")
    .slice(0, MAX_CHARACTERS);

  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL_ID;

  const res = await fetch(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: modelId }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : typeof detail?.message === "string"
          ? detail.message
          : `ElevenLabs request failed with status ${res.status}.`;
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
