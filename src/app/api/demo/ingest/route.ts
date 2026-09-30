import { NextResponse } from "next/server";
import { dayKeyKst } from "@/lib/date-kst";
import { SAMPLE_CHAT, parseChatToNcr } from "@/lib/parse-ncr";
import { upsertMessage } from "@/lib/store";
import type { StoredMessage } from "@/lib/models";
import { maybeRunScheduledDailyExport } from "@/lib/daily-export";

export const runtime = "nodejs";

/** Inject sample Telegram-like QC messages for local demo without a bot token. */
export async function POST() {
  const now = Date.now();
  const chunks = SAMPLE_CHAT.split(/\n{2,}/).filter((c) =>
    /품명|부적합/.test(c),
  );

  let inserted = 0;
  chunks.forEach((chunk, i) => {
    const parsed = parseChatToNcr(chunk);
    if (!parsed.length) return;
    const receivedAt = new Date(now - (chunks.length - i) * 60_000).toISOString();
    const message: StoredMessage = {
      id: crypto.randomUUID(),
      source: "demo",
      chatId: "-100demo-qc",
      chatTitle: "품질부적합(데모)",
      externalId: `demo-${dayKeyKst()}-${i}-${now}`,
      sender: parsed[0]?.reporter || "데모봇",
      text: chunk.trim(),
      receivedAt,
      dayKey: dayKeyKst(),
      parsed,
      parseSource: "pattern",
      needsReview: false,
    };
    if (upsertMessage(message).inserted) inserted++;
  });

  await maybeRunScheduledDailyExport();

  return NextResponse.json({
    ok: true,
    inserted,
    note: "봇 토큰 없이 일일 수집 흐름을 미리보는 데모 데이터입니다.",
  });
}
