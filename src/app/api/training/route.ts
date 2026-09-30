import { NextResponse } from "next/server";
import { rebuildLexicon, trainingStats } from "@/lib/training";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, ...trainingStats() });
}

/** Force rebuild lexicon from samples.jsonl */
export async function POST() {
  const lexicon = rebuildLexicon();
  return NextResponse.json({ ok: true, lexicon });
}
