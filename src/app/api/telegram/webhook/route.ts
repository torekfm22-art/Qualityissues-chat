import { NextResponse } from "next/server";
import { getSettings } from "@/lib/store";
import { ingestTelegramMessage, type TelegramUpdate } from "@/lib/telegram";
import { maybeRunScheduledDailyExport } from "@/lib/daily-export";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const settings = getSettings();
  const secret = settings.telegramWebhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const update = (await request.json()) as TelegramUpdate;
  const msg = update.message || update.channel_post;
  if (!msg) return NextResponse.json({ ok: true, skipped: "no_message" });

  const result = ingestTelegramMessage(msg);
  await maybeRunScheduledDailyExport();

  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    skipped: result.skipped ?? null,
  });
}
