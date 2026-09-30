import { NextResponse } from "next/server";
import { getSettings } from "@/lib/store";
import { parseChatToNcrHybrid } from "@/lib/parse-hybrid";
import { resolveLlmConfig } from "@/lib/llm-ncr";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };
    const text = String(body.text || "").trim();
    if (!text) {
      return NextResponse.json(
        { ok: false, error: "text가 비어 있습니다." },
        { status: 400 },
      );
    }

    const settings = getSettings();
    const result = await parseChatToNcrHybrid(text, {
      llmAssistEnabled: settings.llmAssistEnabled !== false,
    });
    const llm = resolveLlmConfig(settings.llmAssistEnabled !== false);

    return NextResponse.json({
      ok: true,
      ...result,
      llmConfigured: llm.mode === "openai",
      llmMode: result.llmMode === "off" ? llm.mode : result.llmMode,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "parse failed" },
      { status: 500 },
    );
  }
}
