import { NextResponse } from "next/server";
import { getSettings, resolveBotToken, updateSettings } from "@/lib/store";
import { getBotProfile } from "@/lib/telegram";
import type { AppSettings } from "@/lib/models";

export const runtime = "nodejs";

export async function GET() {
  const settings = getSettings();
  const token = resolveBotToken(settings);
  let bot: { id: number; username?: string; first_name: string } | null = null;
  let botError: string | null = null;
  if (token) {
    try {
      bot = await getBotProfile(token);
    } catch (e) {
      botError = e instanceof Error ? e.message : "봇 조회 실패";
    }
  }

  return NextResponse.json({
    settings: {
      ...settings,
      telegramBotToken: settings.telegramBotToken ? "••••••••" : "",
      hasToken: Boolean(token),
      tokenFromEnv: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    },
    bot,
    botError,
  });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Partial<AppSettings> & {
    telegramBotToken?: string;
  };

  const patch: Partial<AppSettings> = {};
  if (typeof body.exportHourKst === "number") {
    patch.exportHourKst = Math.min(23, Math.max(0, Math.floor(body.exportHourKst)));
  }
  if (typeof body.autoExportEnabled === "boolean") {
    patch.autoExportEnabled = body.autoExportEnabled;
  }
  if (Array.isArray(body.telegramChatIds)) {
    patch.telegramChatIds = body.telegramChatIds
      .map((v) => String(v).trim())
      .filter(Boolean);
  }
  if (
    typeof body.telegramBotToken === "string" &&
    body.telegramBotToken &&
    !body.telegramBotToken.includes("•")
  ) {
    patch.telegramBotToken = body.telegramBotToken.trim();
  }
  if (typeof body.telegramWebhookSecret === "string") {
    patch.telegramWebhookSecret = body.telegramWebhookSecret.trim();
  }

  const settings = updateSettings(patch);
  return NextResponse.json({
    ok: true,
    settings: {
      ...settings,
      telegramBotToken: settings.telegramBotToken ? "••••••••" : "",
      hasToken: Boolean(resolveBotToken(settings)),
    },
  });
}
