import { NextResponse } from "next/server";
import {
  getSettings,
  resolveBotToken,
  updateSettings,
} from "@/lib/store";
import {
  deleteWebhook,
  getWebhookInfo,
  setWebhook,
} from "@/lib/telegram";

export const runtime = "nodejs";

export async function GET() {
  const settings = getSettings();
  const token = resolveBotToken(settings);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "텔레그램 봇 토큰이 없습니다." },
      { status: 400 },
    );
  }
  try {
    const info = await getWebhookInfo(token);
    return NextResponse.json({ ok: true, info });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "webhook info failed" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const settings = getSettings();
  const token = resolveBotToken(settings);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "텔레그램 봇 토큰이 없습니다." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    action?: "set" | "delete";
    url?: string;
    secret?: string;
  };

  try {
    if (body.action === "delete") {
      await deleteWebhook(token);
      return NextResponse.json({
        ok: true,
        info: await getWebhookInfo(token),
        note: "웹훅 해제됨. 이제 getUpdates / npm run collector 폴링을 사용할 수 있습니다.",
      });
    }

    const url = body.url?.trim();
    if (!url || !url.startsWith("https://")) {
      return NextResponse.json(
        {
          ok: false,
          error: "공개 HTTPS 웹훅 URL이 필요합니다. 예: https://host/api/telegram/webhook",
        },
        { status: 400 },
      );
    }

    const secret =
      body.secret?.trim() ||
      settings.telegramWebhookSecret ||
      crypto.randomUUID().replace(/-/g, "");

    if (!settings.telegramWebhookSecret && !body.secret) {
      updateSettings({ telegramWebhookSecret: secret });
    } else if (body.secret?.trim()) {
      updateSettings({ telegramWebhookSecret: secret });
    }

    await setWebhook(token, url, secret);
    return NextResponse.json({
      ok: true,
      secretSaved: true,
      info: await getWebhookInfo(token),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "webhook setup failed" },
      { status: 400 },
    );
  }
}
