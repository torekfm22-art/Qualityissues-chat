import { NextResponse } from "next/server";
import { dayKeyKst } from "@/lib/date-kst";
import { clearMessages, listMessages } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dayKey = searchParams.get("day") || dayKeyKst();
  const messages = listMessages({ dayKey });
  const ncrCount = messages.reduce((sum, m) => sum + Math.max(m.parsed.length, 1), 0);

  return NextResponse.json({
    dayKey,
    messages,
    stats: {
      messageCount: messages.length,
      ncrCount,
      bySource: messages.reduce<Record<string, number>>((acc, m) => {
        acc[m.source] = (acc[m.source] || 0) + 1;
        return acc;
      }, {}),
    },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const dayKey = searchParams.get("day") || undefined;
  const removed = clearMessages(dayKey);
  return NextResponse.json({ ok: true, removed });
}
