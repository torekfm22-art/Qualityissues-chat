import { NextResponse } from "next/server";
import { ingestKakaoExport } from "@/lib/kakao-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: "파일이 없습니다." },
          { status: 400 },
        );
      }
      const text = await file.text();
      const result = ingestKakaoExport(text, { fileName: file.name });
      return NextResponse.json({ ok: true, ...result });
    }

    const body = (await request.json()) as { text?: string; fileName?: string };
    if (!body.text?.trim()) {
      return NextResponse.json(
        { ok: false, error: "텍스트가 비어 있습니다." },
        { status: 400 },
      );
    }
    const result = ingestKakaoExport(body.text, { fileName: body.fileName });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "import failed" },
      { status: 500 },
    );
  }
}
