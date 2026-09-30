import { NextResponse } from "next/server";
import { pollTelegramUpdates } from "@/lib/telegram";
import { maybeRunScheduledDailyExport } from "@/lib/daily-export";

export const runtime = "nodejs";

/** One-shot poll — call from UI or cron when webhook URL is unavailable. */
export async function POST() {
  try {
    const result = await pollTelegramUpdates();
    const scheduled = await maybeRunScheduledDailyExport();
    return NextResponse.json({ ok: true, ...result, scheduled });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "poll failed" },
      { status: 400 },
    );
  }
}
