import { emptyNcr, type NcrRecord } from "./types";

type FieldKey = keyof Omit<NcrRecord, "id" | "raw">;

/** Field label synonyms commonly used in Korean QC chats */
const FIELD_PATTERNS: { key: FieldKey; patterns: RegExp[] }[] = [
  {
    key: "productName",
    patterns: [
      /^(?:품\s*명|제품명|제품|품목|모델명|model)\s*[:=\-–>]?\s*(.+)$/i,
    ],
  },
  {
    key: "partNumber",
    patterns: [
      /^(?:품\s*번|자재\s*코드|자재번호|파트\s*넘버|part\s*(?:no|number|#)|P\/?N)\s*[:=\-–>]?\s*(.+)$/i,
    ],
  },
  {
    key: "defect",
    patterns: [
      /^(?:불량\s*현상|불량내용|불량\s*내역|현상|하자|결함|defect|문제점|부적합\s*내용)\s*[:=\-–>]?\s*(.+)$/i,
    ],
  },
  {
    key: "process",
    patterns: [
      /^(?:공정\s*번호|공정번호|공정명|공정|프로세스|process)\s*[:=\-–>]?\s*(.+)$/i,
    ],
  },
  {
    key: "quantity",
    patterns: [
      /^(?:수\s*량|불량\s*수|발생\s*수|qty|quantity|개수)\s*[:=\-–>]?\s*(.+)$/i,
    ],
  },
  {
    key: "lot",
    patterns: [
      /^(?:로트(?:\s*번호)?|배치|batch)\s*[:=\-–>]?\s*(.+)$/i,
      /^(?:LOT(?:\s*(?:NO|번호|#))?)\s*[:=]\s*(.+)$/i,
      /^(?:LOT(?:\s*(?:NO|번호|#))?)\s+(.+)$/i,
    ],
  },
  {
    key: "line",
    patterns: [
      /^(?:라인|설비|호기|라인\s*명|설비명|line|equipment)\s*[:=\-–>]?\s*(.+)$/i,
    ],
  },
  {
    key: "action",
    patterns: [
      /^(?:조치\s*내용|조치사항|조치|대응|처분|disposition)\s*[:=\-–>]?\s*(.+)$/i,
    ],
  },
  {
    key: "note",
    patterns: [/^(?:비고|메모|참고|remark|note)\s*[:=\-–>]?\s*(.+)$/i],
  },
  {
    key: "occurredAt",
    patterns: [
      /^(?:발생\s*(?:일\s*시|일자|일|시각)|일시|날짜|date|발생시각)\s*[:=\-–>]?\s*(.+)$/i,
    ],
  },
  {
    key: "reporter",
    patterns: [
      /^(?:보고자|작성자|통보\s*자|담당자|reporter|작성)\s*[:=\-–>]?\s*(.+)$/i,
    ],
  },
];

const KAKAOTALK_SENDER_LINE =
  /^(.+?)\s+(오[전후]\s+\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)$/;

const TELEGRAM_SENDER_LINE =
  /^(.+?),\s*\[(\d{1,2}\.\d{1,2}\.\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?)\]$/;

const DATE_BANNER =
  /^-*\s*\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일(?:\s*\S+)?\s*-*$|^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/;

const SECTION_MARKERS =
  /^(?:#{1,3}\s*|■|●|◆|▶|★|※|【)\s*(?:품질\s*)?(?:부적합|NCR|불량\s*보고|이상\s*통보|통보|보고)(?:\s|$)|^\[\s*(?:품질\s*)?(?:부적합|NCR)\s*\]/i;

const BULLET = /^[\s]*[-–—*·•▪▸►]\s*/;

const QUANTITY_TOKEN = /^(?:\d+(?:[.,]\d+)?)\s*(?:EA|ea|개|pcs|PCS|ea\.?)?$/;
const PROCESS_TOKEN = /^(?:P[-_]?\d+\S*|공정\s*\S+)/i;
const LOT_TOKEN = /^(?:LOT|로트)[-_]?\S+/i;

function cleanValue(value: string): string {
  return value
    .replace(/^[\s:=\-–>"'【】\[\]]+/, "")
    .replace(/[\s]+$/g, "")
    .replace(/\s*[|/]\s*$/, "")
    .trim();
}

function stripBullet(line: string): string {
  return line.replace(BULLET, "").trim();
}

function looksLikeMessengerTimeOnly(line: string): boolean {
  return /^(?:\[?(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2})\]?\s*)?(?:오[전후]\s*)?\d{1,2}:\d{2}(?::\d{2})?\s*$/.test(
    line,
  );
}

/**
 * Split pasted chat into message blocks.
 * Handles blank-line separators, KakaoTalk/Telegram headers, and NCR markers.
 */
export function splitMessages(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let lastDateBanner = "";

  const flush = () => {
    const body = current.join("\n").trim();
    if (body) blocks.push(body);
    current = [];
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      if (current.length > 0) flush();
      continue;
    }

    if (DATE_BANNER.test(line)) {
      lastDateBanner = line.replace(/^-+\s*|\s*-+$/g, "").trim();
      continue;
    }

    if (looksLikeMessengerTimeOnly(line)) {
      continue;
    }

    const kakao = line.match(KAKAOTALK_SENDER_LINE);
    const telegram = line.match(TELEGRAM_SENDER_LINE);
    const isSection = SECTION_MARKERS.test(line);

    // Section markers mid-block (after sender metadata) should not always flush
    if ((kakao || telegram) && current.length > 0) {
      flush();
    } else if (isSection && current.length > 0) {
      const onlyMeta = current.every((l) =>
        /^\[(보고자|발생일시)\]/.test(l.trim()),
      );
      if (!onlyMeta) flush();
    }

    if (kakao) {
      const stamp = lastDateBanner
        ? `${lastDateBanner} ${kakao[2]}`
        : kakao[2];
      current.push(`[보고자] ${kakao[1]}`);
      current.push(`[발생일시] ${stamp}`);
      continue;
    }

    if (telegram) {
      current.push(`[보고자] ${telegram[1]}`);
      current.push(`[발생일시] ${telegram[2]}`);
      continue;
    }

    current.push(raw);
  }

  flush();
  return blocks;
}

function normalizeLabeledLine(line: string): string {
  const bracket = line.match(
    /^[\[【(]\s*([^\]】)]+?)\s*[\]】)]\s*[:=\-–>]?\s*(.+)$/,
  );
  if (bracket) return `${bracket[1].trim()}: ${bracket[2].trim()}`;

  const colon = line.match(/^([^:=\-–>]{1,20})\s*[:=\-–>]\s*(.+)$/);
  if (colon) return `${colon[1].trim()}: ${colon[2].trim()}`;

  return line;
}

function applyLabeledFields(block: string, record: NcrRecord): string[] {
  const leftover: string[] = [];
  const lines = block.split("\n");

  for (const rawLine of lines) {
    const line = stripBullet(rawLine);
    if (!line) continue;
    if (SECTION_MARKERS.test(line)) continue;

    const normalized = normalizeLabeledLine(line);
    let matched = false;

    for (const field of FIELD_PATTERNS) {
      for (const pattern of field.patterns) {
        const m = normalized.match(pattern);
        if (m?.[1]) {
          let value = cleanValue(m[1]);

          // "품명 리어커버 / 스크래치 / P-108" → product only, rest leftover
          if (
            (field.key === "productName" || field.key === "defect") &&
            /\s*[|/｜]\s*/.test(value)
          ) {
            const parts = value.split(/\s*[|/｜]\s*/).map((p) => p.trim());
            value = parts[0] ?? value;
            const rest = parts.slice(1).join(" / ");
            if (rest) leftover.push(rest);
          }

          if (value && !record[field.key]) {
            record[field.key] = value;
            matched = true;
            break;
          }
        }
      }
      if (matched) break;
    }

    if (!matched) leftover.push(line);
  }

  return leftover;
}

/**
 * Slash / pipe delimited free-form:
 * "브라켓A / 스크래치 / P-045 / 12개"
 */
function applyDelimitedGuess(leftover: string[], record: NcrRecord) {
  const joined = leftover.join(" ").trim();
  if (!joined) return;

  const parts = joined
    .split(/\s*[|/｜]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    if (!record.defect && !record.productName) {
      record.defect = joined;
    } else if (!record.note) {
      record.note = joined;
    } else {
      record.note = `${record.note} / ${joined}`;
    }
    return;
  }

  const assignOrder: FieldKey[] = [
    "productName",
    "defect",
    "process",
    "quantity",
    "lot",
  ];

  let ai = 0;
  for (const part of parts) {
    const stripped = part.replace(/^(?:공정|품명|수량|로트)\s+/i, "").trim();

    if (!record.quantity && QUANTITY_TOKEN.test(stripped)) {
      record.quantity = stripped;
      continue;
    }
    if (!record.process && PROCESS_TOKEN.test(stripped)) {
      record.process = stripped;
      continue;
    }
    if (!record.lot && LOT_TOKEN.test(stripped)) {
      record.lot = stripped;
      continue;
    }

    while (ai < assignOrder.length && record[assignOrder[ai]]) ai++;
    if (ai < assignOrder.length) {
      record[assignOrder[ai]] = stripped || part;
      ai++;
    } else if (!record.note) {
      record.note = part;
    } else {
      record.note += ` / ${part}`;
    }
  }
}

function parseBlock(block: string): NcrRecord {
  const record = emptyNcr({ raw: block });
  const leftover = applyLabeledFields(block, record);
  applyDelimitedGuess(leftover, record);

  if (record.quantity) {
    record.quantity = record.quantity.replace(/\s+/g, " ").trim();
  }

  return record;
}

export function parseChatToNcr(text: string): NcrRecord[] {
  const blocks = splitMessages(text);
  if (blocks.length === 0) return [];

  const records: NcrRecord[] = [];
  for (const block of blocks) {
    const productHits = [
      ...block.matchAll(
        /(?:^|\n)\s*[-–—*·•]?\s*(?:품\s*명|제품명)\s*[:=\-–>]/gim,
      ),
    ];
    if (productHits.length > 1) {
      const indices = productHits.map((m) => m.index ?? 0);
      for (let i = 0; i < indices.length; i++) {
        const start = indices[i];
        const end = i + 1 < indices.length ? indices[i + 1] : block.length;
        const slice = block.slice(start, end).trim();
        if (slice) records.push(parseBlock(slice));
      }
    } else {
      records.push(parseBlock(block));
    }
  }

  return records.filter(
    (r) =>
      r.productName ||
      r.defect ||
      r.process ||
      r.quantity ||
      r.partNumber ||
      r.lot,
  );
}

export const SAMPLE_CHAT = `--------------- 2026년 3월 28일 토요일 ---------------
김품질 오전 9:14
[품질 부적합]
품명: 프론트 브라켓 ASSY
품번: BRK-2204-A
불량현상: 도장 표면 스크래치 (장변 측 3~5mm)
공정번호: P-312 도장
수량: 8 EA
로트: LOT-260328-07
라인: 도장2호기
조치내용: 해당 LOT 격리, 선별검사 진행
비고: 입고검사 중 발견

이공정 오전 9:22
품명 리어커버 / 치수과다(φ8.0→φ8.3) / 공정 P-108 / 3개 / LOT-260327-12

박검사 오전 10:05
■ 부적합 보고
- 품명: 하네스 케이블 H-15
- 불량현상: 커넥터 핀 휨
- 공정: 조립3라인
- 수량: 2
- 조치: 전량 선별 후 양품만 투입
`;
