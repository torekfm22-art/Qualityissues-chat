import { emptyNcr, type NcrRecord } from "./types";
import { isConfidentNcrRecord } from "./parse-ncr";
import {
  getFewShotExamples,
  learnedProductNames,
  learnedVehicleModels,
} from "./training";

export type LlmAssistMode = "openai" | "mock" | "off";

export interface LlmConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  mode: LlmAssistMode;
}

export function resolveLlmConfig(enabledFromSettings = true): LlmConfig {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.LLM_API_KEY?.trim() ||
    "";
  const baseUrl = (
    process.env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = process.env.LLM_MODEL?.trim() || "gpt-4o-mini";
  const forceMock = process.env.LLM_FORCE_MOCK === "1";

  if (!enabledFromSettings) {
    return { enabled: false, apiKey, baseUrl, model, mode: "off" };
  }
  if (forceMock || !apiKey) {
    return { enabled: true, apiKey, baseUrl, model, mode: "mock" };
  }
  return { enabled: true, apiKey, baseUrl, model, mode: "openai" };
}

function buildSystemPrompt(): string {
  const models = learnedVehicleModels();
  const products = learnedProductNames();
  const modelHint = models.length
    ? `현장 확인 차종 예: ${models.slice(0, 20).join(", ")}.`
    : "차종 예: JG1, SG2, SP2, MV1, MQ4.";
  const productHint = products.length
    ? `현장 확인 품명 예: ${products.slice(0, 20).join(", ")}.`
    : "품명 예: ICCU.";

  return `당신은 자동차/전자 공장 품질 부적합(NCR) 톡을 표 필드로 정리하는 도우미입니다.
주어진 한국어 현장 톡에서 JSON만 반환하세요. 추측으로 없는 값을 만들지 마세요. 없으면 빈 문자열.
차종(vehicleModel)과 품명(productName)을 섞지 마세요. ${modelHint} ${productHint}

응답 형식:
{"records":[{"vehicleModel":"","productName":"","partNumber":"","defect":"","process":"","quantity":"","lot":"","line":"","action":"","note":"","reporter":"","occurredAt":""}]}
부적합이 아니면 {"records":[]}`;
}

function buildFewShotMessages(): { role: "user" | "assistant"; content: string }[] {
  const shots = getFewShotExamples(5);
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const shot of shots) {
    out.push({ role: "user", content: shot.text.slice(0, 800) });
    out.push({
      role: "assistant",
      content: JSON.stringify({
        records: [
          {
            vehicleModel: shot.after.vehicleModel || "",
            productName: shot.after.productName || "",
            partNumber: shot.after.partNumber || "",
            defect: shot.after.defect || "",
            process: shot.after.process || "",
            quantity: shot.after.quantity || "",
            lot: shot.after.lot || "",
            line: shot.after.line || "",
            action: shot.after.action || "",
            note: shot.after.note || "",
            reporter: shot.after.reporter || "",
            occurredAt: shot.after.occurredAt || "",
          },
        ],
      }),
    });
  }
  return out;
}

function normalizeRecord(raw: Partial<NcrRecord>, sourceText: string): NcrRecord {
  return emptyNcr({
    vehicleModel: String(raw.vehicleModel ?? "").trim(),
    productName: String(raw.productName ?? "").trim(),
    partNumber: String(raw.partNumber ?? "").trim(),
    defect: String(raw.defect ?? "").trim(),
    process: String(raw.process ?? "").trim(),
    quantity: String(raw.quantity ?? "").trim(),
    lot: String(raw.lot ?? "").trim(),
    line: String(raw.line ?? "").trim(),
    action: String(raw.action ?? "").trim(),
    note: String(raw.note ?? "").trim(),
    reporter: String(raw.reporter ?? "").trim(),
    occurredAt: String(raw.occurredAt ?? "").trim(),
    raw: sourceText,
  });
}

function markAssist(record: NcrRecord, label: string): NcrRecord {
  const tag = `〔${label}〕`;
  if (record.note.includes(tag)) return record;
  return {
    ...record,
    note: record.note ? `${record.note} ${tag}` : tag,
  };
}

/**
 * Local stand-in when no API key is configured.
 * Uses loose field cues so hybrid flow is testable offline.
 */
export function mockLlmParseNcr(text: string): NcrRecord[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^\[(보고자|발생일시)\]/.test(l));

  const record = emptyNcr({ raw: text });

  for (const line of lines) {
    if (!record.process) {
      const m = line.match(/^#?\s*(\d+)\s*공정\s*$/);
      if (m) {
        record.process = `${m[1]}공정`;
        continue;
      }
    }
    if (!record.quantity) {
      const m = line.match(/^(\d+(?:[.,]\d+)?)\s*(ea|EA|개)\s*$/i);
      if (m) {
        record.quantity = `${m[1]}${m[2]}`;
        continue;
      }
    }
    if (/^[（(].+[）)]$/.test(line)) {
      const note = line.replace(/^[（(]|[）)]$/g, "").trim();
      record.note = record.note ? `${record.note} / ${note}` : note;
      continue;
    }
    // Prefer structured "차종 품명 불량" lines before action heuristics
    if (!record.productName || !record.defect) {
      const coded = line.match(
        /^([A-Z]{1,4}\d+[A-Z]?)\s+([A-Za-z0-9_-]+)\s*[,，]?\s*(.+)$/,
      );
      if (coded) {
        if (!record.vehicleModel) record.vehicleModel = coded[1];
        if (!record.productName) record.productName = coded[2];
        if (!record.defect) {
          record.defect = coded[3].replace(/^[,，]\s*/, "").trim();
        }
        continue;
      }
    }
    // Short action-only lines (not the whole prose blob)
    if (
      !record.action &&
      line.length <= 48 &&
      /격리|조치|리워크|전수검사|원인\s*분석|대기|시행/.test(line)
    ) {
      record.action = line;
    }
  }

  // Free-form leftovers: qty / process / defect words in one blob
  const blob = lines.join(" ");
  if (!record.process) {
    const m = blob.match(/#?\s*(\d+)\s*공정/);
    if (m) record.process = `${m[1]}공정`;
  }
  if (!record.quantity) {
    const m = blob.match(/(\d+(?:[.,]\d+)?)\s*(EA|ea|개)/);
    if (m) record.quantity = `${m[1]}${m[2]}`;
  }
  if (!record.vehicleModel) {
    const m = blob.match(/\b([A-Z]{1,4}\d+[A-Z]?)\b/);
    if (m) record.vehicleModel = m[1];
  }
  if (!record.productName) {
    const learned = learnedProductNames().find((p) => blob.includes(p));
    if (learned) {
      record.productName = learned;
    } else {
      const m = blob.match(/\b(ICCU|[A-Z]{2,}(?:\s*ASSY)?)\b/);
      if (m && m[1] !== record.vehicleModel) record.productName = m[1];
    }
  }
  if (!record.vehicleModel) {
    const learned = learnedVehicleModels().find((m) =>
      new RegExp(`\\b${m}\\b`, "i").test(blob),
    );
    if (learned) record.vehicleModel = learned;
  }
  if (!record.defect) {
    const m = blob.match(
      /(?:설체결|설삽입|이음|스크래치|찍힘|기밀검사\s*NG|절연(?:저항)?(?:\s*검사)?\s*NG|\bNG\b|치수과다|치수미달|휨|크랙)[^\n.]*/i,
    );
    if (m) record.defect = m[0].trim();
  }
  if (!record.action) {
    const m = blob.match(
      /((?:격리\s*조치|리워크|전수검사|원인\s*분석)[^.。!]*)/,
    );
    if (m) record.action = m[1].replace(/\s+/g, " ").trim();
  }

  const out = [record].filter(isConfidentNcrRecord).map((r) =>
    markAssist(r, "LLM 보조·로컬"),
  );
  return out;
}

export async function openaiParseNcr(
  text: string,
  config: LlmConfig,
): Promise<NcrRecord[]> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        ...buildFewShotMessages(),
        { role: "user", content: text.slice(0, 4000) },
      ],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `LLM API ${res.status}: ${errText.slice(0, 200) || res.statusText}`,
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content?.trim() || "{}";
  let parsed: { records?: Partial<NcrRecord>[] };
  try {
    parsed = JSON.parse(content) as { records?: Partial<NcrRecord>[] };
  } catch {
    throw new Error("LLM 응답 JSON 파싱 실패");
  }

  const records = (parsed.records || [])
    .map((r) => normalizeRecord(r, text))
    .filter(isConfidentNcrRecord)
    .map((r) => markAssist(r, "LLM 보조"));

  return records;
}

export async function assistParseNcr(
  text: string,
  enabledFromSettings = true,
): Promise<{ records: NcrRecord[]; mode: LlmAssistMode; error?: string }> {
  const config = resolveLlmConfig(enabledFromSettings);
  if (!config.enabled || config.mode === "off") {
    return { records: [], mode: "off" };
  }

  if (config.mode === "mock") {
    return { records: mockLlmParseNcr(text), mode: "mock" };
  }

  try {
    const records = await openaiParseNcr(text, config);
    return { records, mode: "openai" };
  } catch (e) {
    // Fall back to local assist so ingest does not hard-fail
    const records = mockLlmParseNcr(text);
    return {
      records,
      mode: "mock",
      error: e instanceof Error ? e.message : "LLM 호출 실패",
    };
  }
}
