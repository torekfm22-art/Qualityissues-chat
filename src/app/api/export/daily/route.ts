import { readFileSync } from "fs";
import { NextResponse } from "next/server";
import { dayKeyKst } from "@/lib/date-kst";
import {
  dailyExportExists,
  exportFilePath,
  generateDailyExcel,
} from "@/lib/daily-export";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dayKey = searchParams.get("day") || dayKeyKst();
  const regenerate = searchParams.get("regenerate") === "1";

  try {
    let bytes: Uint8Array;
    if (!regenerate && dailyExportExists(dayKey)) {
      bytes = new Uint8Array(readFileSync(exportFilePath(dayKey)));
    } else {
      const result = await generateDailyExcel(dayKey);
      bytes = result.bytes;
    }

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ncr_${dayKey}.xlsx"; filename*=UTF-8''${encodeURIComponent(`품질부적합_${dayKey}.xlsx`)}`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "export failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { day?: string };
  const dayKey = body.day || dayKeyKst();
  const result = await generateDailyExcel(dayKey);
  return NextResponse.json({
    ok: true,
    dayKey: result.dayKey,
    count: result.count,
    file: `data/exports/품질부적합_${dayKey}.xlsx`,
  });
}
