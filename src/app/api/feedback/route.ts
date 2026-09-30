import { NextResponse } from "next/server";
import { emptyNcr, type NcrRecord } from "@/lib/types";
import { getMessageById, updateMessageById } from "@/lib/store";
import { appendTrainingSample, trainingStats } from "@/lib/training";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, ...trainingStats() });
}

/**
 * Confirm or correct a stored message's NCR fields.
 * Confirmed/corrected rows become training samples that enrich
 * the pattern lexicon and LLM few-shot examples.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messageId?: string;
      recordId?: string;
      kind?: "confirm" | "correct";
      fields?: Partial<NcrRecord>;
    };

    const messageId = String(body.messageId || "").trim();
    const kind = body.kind === "correct" ? "correct" : "confirm";
    if (!messageId) {
      return NextResponse.json(
        { ok: false, error: "messageId가 필요합니다." },
        { status: 400 },
      );
    }

    const message = getMessageById(messageId);
    if (!message) {
      return NextResponse.json(
        { ok: false, error: "메시지를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const recordId = body.recordId?.trim();
    const idx = recordId
      ? message.parsed.findIndex((r) => r.id === recordId)
      : 0;
    if (idx < 0 || !message.parsed[idx]) {
      return NextResponse.json(
        { ok: false, error: "파싱 행을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const before = message.parsed[idx];
    const merged = emptyNcr({
      ...before,
      ...(body.fields || {}),
      id: before.id,
      raw: before.raw || message.text,
    });

    // Strip assist tags from confirmed note for clean training labels
    merged.note = merged.note.replace(/\s*〔[^〕]+〕/g, "").trim();

    const parsed = [...message.parsed];
    parsed[idx] = merged;

    const updated = updateMessageById(messageId, {
      parsed,
      needsReview: false,
      confirmed: true,
      confirmedAt: new Date().toISOString(),
    });

    const { sample, lexicon } = appendTrainingSample({
      messageId,
      text: message.text,
      before,
      after: merged,
      parseSource: message.parseSource,
      kind,
    });

    return NextResponse.json({
      ok: true,
      kind,
      sampleId: sample.id,
      message: updated,
      lexicon: {
        sampleCount: lexicon.sampleCount,
        vehicleModels: lexicon.vehicleModels.length,
        productNames: lexicon.productNames.length,
        defectTerms: lexicon.defectTerms.length,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "feedback failed" },
      { status: 500 },
    );
  }
}
