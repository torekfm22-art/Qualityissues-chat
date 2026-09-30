import { NextResponse } from "next/server";
import { getSettings } from "@/lib/store";
import { pollTelegramUpdates } from "@/lib/telegram";
import { maybeRunScheduledDailyExport } from "@/lib/daily-export";

export const runtime = "nodejs";

export async function GET() {
  const settings = getSettings();
  return NextResponse.json({
    chats: settings.discoveredChats,
    allowed: settings.telegramChatIds,
  });
}

/** Collect recent updates and return discovered chat rooms (also ingests NCR). */
export async function POST() {
  try {
    const result = await pollTelegramUpdates();
    await maybeRunScheduledDailyExport();
    return NextResponse.json({
      ok: true,
      chats: result.discovered,
      inserted: result.inserted,
      processed: result.processed,
      tip: result.discovered.length
        ? undefined
        : "방에 메시지를 보낸 뒤 다시 검색해 주세요.",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "probe failed" },
      { status: 400 },
    );
  }
}
