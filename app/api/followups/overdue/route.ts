export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { listPlannedFollowUps } from "@/lib/followUps";
import { localYYYYMMDD } from "@/lib/localDate";

export async function GET() {
  const today = localYYYYMMDD();
  const items = await listPlannedFollowUps({ lt: today });

  return NextResponse.json({ today, items });
}
