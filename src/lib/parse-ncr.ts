import { emptyNcr, type NcrRecord } from "./types";

export interface ParseOptions {
  /** Extra defect terms from human-confirmed training lexicon (server). */
  extraDefectTerms?: string[];
  /** Confirmed vehicle model codes (server). */
  learnedVehicleModels?: string[];
  /** Confirmed product names (server). */
  learnedProductNames?: string[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type FieldKey = keyof Omit<NcrRecord, "id" | "raw">;

/** Field label synonyms commonly used in Korean QC chats */
const FIELD_PATTERNS: { key: FieldKey; patterns: RegExp[] }[] = [
  {
    key: "vehicleModel",
    patterns: [
      /^(?:차\s*종|모델(?:\s*명)?|기종|vehicle\s*model|car\s*model)\s*[:=\-–>]?\s*(.+)$/i,
    ],
  },
  {
    key: "productName",
    patterns: [
      /^(?:품\s*명|제품명|제품|품목)\s*[:=\-–>]?\s*(.+)$/i,
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
const PROCESS_TOKEN = /^(?:P[-_]?\d+\S*|공정\s*\S+|#?\d+\s*공정)/i;
const LOT_TOKEN = /^(?:LOT|로트)[-_]?\S+/i;

/** Built-in defect / phenomenon words used in free-form field talk */
const BASE_DEFECT_WORD =
  /(?:스크래치|찍힘불량|찍힘|찍혀|휨|치수과다|치수미달|치수\s*불량|크랙|균열|오염|변색|파손|깨짐|들뜸|박리|이물|버어|미압입|미조립|누락|변형|함몰|갈라짐|벗겨짐|부유물|기포|웰드라인|플래시|설체결|오체결|미체결|설삽입|오삽입|미삽입|이음|기밀\s*(?:검사\s*)?NG|절연(?:저항)?(?:\s*검사)?\s*NG|검사\s*NG|\bNG\b|short\s*shot|\bburr\b)/i;

/** Base + optional learned defect terms (passed from server training lexicon). */
export function getDefectWordRegex(extraTerms: string[] = []): RegExp {
  if (!extraTerms.length) return BASE_DEFECT_WORD;
  const extra = extraTerms.map(escapeRegExp).join("|");
  return new RegExp(`(?:${BASE_DEFECT_WORD.source}|${extra})`, "i");
}

let activeOpts: ParseOptions = {};

function defectRe(): RegExp {
  return getDefectWordRegex(activeOpts.extraDefectTerms || []);
}

const LOCATION_WORD =
  /(?:상단부?|하단부?|측면|표면|내면|외면|좌측|우측|앞쪽|뒤쪽|코너|모서리|장변|단변|전체)/;

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
    // Leave field-style prose for applyNaturalLanguageGuess
    const looksNatural =
      defectRe().test(joined) ||
      /\d+\s*(?:EA|ea|개)\b/.test(joined) ||
      /#?\d+\s*공정/.test(joined);
    if (looksNatural) return;

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

/**
 * Plant report format used in quality Telegram rooms:
 *   #220공정
 *   JG1 ICCU 하우징 볼트 설체결
 *   2ea
 *   격리 조치 후 리워크 대기
 */
function applyPlantReportFormat(block: string, record: NcrRecord): boolean {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^\[(보고자|발생일시)\]/.test(l));

  const procIdx = lines.findIndex((l) => /^#?\s*\d+\s*공정\s*$/.test(l));
  const qtyIdx = lines.findIndex((l) =>
    /^\d+(?:[.,]\d+)?\s*(?:ea|EA|개)\s*$/.test(l),
  );
  if (procIdx < 0 || qtyIdx < 0) return false;

  if (!record.process) {
    const m = lines[procIdx].match(/#?\s*(\d+)\s*공정/);
    if (m) record.process = `${m[1]}공정`;
  }
  if (!record.quantity) {
    const m = lines[qtyIdx].match(/^(\d+(?:[.,]\d+)?)\s*(ea|EA|개)/i);
    if (m) record.quantity = `${m[1]}${m[2]}`;
  }

  const body = lines.filter((_, i) => i !== procIdx && i !== qtyIdx);
  const actionLines: string[] = [];
  const noteLines: string[] = [];
  const contentLines: string[] = [];
  for (const line of body) {
    if (/^[（(].+[）)]$/.test(line)) {
      noteLines.push(line.replace(/^[（(]|[）)]$/g, "").trim());
    } else if (
      /격리|조치|리워크|전수검사|원인\s*분석|분해\s*분석|대기|시행/.test(line)
    ) {
      actionLines.push(line);
    } else {
      contentLines.push(line);
    }
  }

  const content = contentLines.join(" ").replace(/\s+/g, " ").trim();
  // JG1 ICCU 하우징 볼트 설체결  |  SG2 ICCU 기밀검사 NG
  // 차종(JG1) + 품명(ICCU) + 불량…
  const coded = content.match(
    /^([A-Z]{1,4}\d+[A-Z]?)\s+([A-Za-z0-9_-]+)\s*[,，]?\s*(.+)$/,
  );
  if (coded) {
    if (!record.vehicleModel) record.vehicleModel = coded[1];
    if (!record.productName) record.productName = coded[2];
    if (!record.defect) record.defect = coded[3].replace(/^[,，]\s*/, "").trim();
  } else if (content) {
    const ngSplit = content.match(/^(.+?)\s+((?:.+ )?NG|.+)$/i);
    if (!record.productName && !record.defect && ngSplit) {
      // fallback: whole content as defect if short product missing
      record.defect = content;
    } else if (!record.defect) {
      record.defect = content;
    } else if (!record.productName) {
      record.productName = content;
    }
  }

  if (actionLines.length) {
    const joined = actionLines.join(" / ");
    if (!record.action) record.action = joined;
    else if (!record.note) record.note = joined;
  }
  if (noteLines.length) {
    const joined = noteLines.join(" / ");
    if (!record.note) record.note = joined;
    else record.note = `${record.note} / ${joined}`;
  }

  return Boolean(record.process && record.quantity && (record.defect || record.productName));
}

/**
 * Field-style free talk, e.g.
 * "테스트 브라켓 상단부 스크래치 발생 2ea\n#120공정"
 */
function applyNaturalLanguageGuess(leftover: string[], record: NcrRecord) {
  let text = leftover.join("\n").trim();
  if (!text) return;

  // Strip messenger meta that may remain
  text = text
    .replace(/^\[보고자\]\s*.+$/gim, "")
    .replace(/^\[발생일시\]\s*.+$/gim, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (!text) return;

  // Process: #120공정 / 120공정 / 공정 조립3 / P-120
  if (!record.process) {
    let processValue = "";
    let matched = "";
    const hashProc = text.match(/#\s*(\d+)\s*공정/);
    const numProc = text.match(/(\d+)\s*공정/);
    const labelProc = text.match(/공정\s*[#:\-]?\s*([^\n,#|/]+)/i);
    const pCode = text.match(/\b(P[-_]?\d+)\b/i);
    if (hashProc) {
      matched = hashProc[0];
      processValue = `${hashProc[1]}공정`;
    } else if (numProc) {
      matched = numProc[0];
      processValue = `${numProc[1]}공정`;
    } else if (labelProc) {
      matched = labelProc[0];
      processValue = labelProc[1].trim();
    } else if (pCode) {
      matched = pCode[0];
      processValue = pCode[1];
    }
    if (processValue) {
      record.process = processValue;
      text = text.replace(matched, " ").trim();
    }
  }

  // Quantity: 2ea / 2 EA / 2개 / 수량 2
  // Avoid \\b after Korean units — JS word boundaries are ASCII-oriented.
  if (!record.quantity) {
    const qtyMatch =
      text.match(/(\d+(?:[.,]\d+)?)\s*(EA|ea|개|pcs|PCS)(?=$|\s|[^\w])/i) ||
      text.match(/(?:수량|불량\s*수)\s*[:=\-]?\s*(\d+(?:[.,]\d+)?)/i);
    if (qtyMatch) {
      record.quantity = qtyMatch[2]
        ? `${qtyMatch[1]}${qtyMatch[2]}`
        : qtyMatch[1];
      text = text.replace(qtyMatch[0], " ").trim();
    }
  }

  // Lot leftovers
  if (!record.lot) {
    const lotMatch = text.match(/\b((?:LOT|로트)[-_]?\w+)\b/i);
    if (lotMatch) {
      record.lot = lotMatch[1];
      text = text.replace(lotMatch[0], " ").trim();
    }
  }

  text = text.replace(/\s+/g, " ").replace(/^[\s,./|]+|[\s,./|]+$/g, "").trim();
  if (!text) return;

  // "테스트 브라켓 상단부 스크래치 발생"
  const defectIdx = text.search(defectRe());
  if (defectIdx > 0 && (!record.productName || !record.defect)) {
    let productPart = text.slice(0, defectIdx).trim();
    let defectPart = text.slice(defectIdx).trim();

    // Pull trailing location word from product into defect
    const locAtEnd = productPart.match(
      new RegExp(`^(.*?)\\s+(${LOCATION_WORD.source})$`),
    );
    if (locAtEnd && locAtEnd[1].trim()) {
      productPart = locAtEnd[1].trim();
      defectPart = `${locAtEnd[2]} ${defectPart}`.replace(/\s+/g, " ").trim();
    }

    if (!record.productName && productPart) record.productName = productPart;
    if (!record.defect && defectPart) {
      record.defect = defectPart.replace(/\s+/g, " ").trim();
    } else if (
      record.defect &&
      !record.productName &&
      productPart &&
      record.defect.includes(productPart)
    ) {
      // Replace overly broad defect filled earlier
      record.productName = productPart;
      record.defect = defectPart.replace(/\s+/g, " ").trim();
    }
  } else if (!record.defect && !record.productName && defectRe().test(text)) {
    record.defect = text;
  } else if (
    !record.productName &&
    !record.defect &&
    text.length <= 80 &&
    !record.note
  ) {
    record.note = text;
  } else if (
    record.productName &&
    record.defect &&
    !record.note &&
    text &&
    text !== record.productName &&
    text !== record.defect
  ) {
    // leftover prose after structured fields
    if (!text.includes(record.productName) || text.length > record.raw.length) {
      /* keep quiet — usually residual fragments */
    }
  }
}

function parseBlock(block: string): NcrRecord {
  const record = emptyNcr({ raw: block });

  // Prefer plant multiline report format when detected
  const plantOk = applyPlantReportFormat(block, record);

  const leftover = applyLabeledFields(block, record);
  if (!plantOk) {
    applyDelimitedGuess(leftover, record);
  }

  const needsNatural =
    !record.productName ||
    !record.defect ||
    !record.process ||
    !record.quantity;
  if (needsNatural) {
    applyNaturalLanguageGuess(leftover, record);
  }

  if (record.quantity) {
    record.quantity = record.quantity.replace(/\s+/g, " ").trim();
  }

  return record;
}

export function parseChatToNcr(
  text: string,
  opts: ParseOptions = {},
): NcrRecord[] {
  const prev = activeOpts;
  activeOpts = opts;
  try {
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

    return records.filter(isConfidentNcrRecord);
  } finally {
    activeOpts = prev;
  }
}

/**
 * Keep only records that look like real NCR rows — not casual chat fragments.
 * Require at least two meaningful signals among product / defect / qty / process.
 */
export function isConfidentNcrRecord(r: NcrRecord): boolean {
  const hasProduct = Boolean(r.productName?.trim());
  const hasModel = Boolean(r.vehicleModel?.trim());
  const defectText = r.defect?.trim() || "";
  const hasDefectText = Boolean(defectText);
  const hasDefectWord = hasDefectText && defectRe().test(defectText);
  const hasQty = Boolean(r.quantity?.trim());
  const hasProcess = Boolean(r.process?.trim());
  const hasPart = Boolean(r.partNumber?.trim());
  const hasLot = Boolean(r.lot?.trim());
  const hasAction = Boolean(r.action?.trim());

  // Plant format: #N공정 + qty + (차종/품명/불량 body)
  const plantShape =
    /^#?\s*\d+\s*공정/m.test(r.raw) &&
    /\d+\s*(?:ea|EA|개)\b/i.test(r.raw) &&
    hasProcess &&
    hasQty &&
    (hasProduct || hasDefectText || hasModel);
  if (plantShape) return true;

  // Explicit labels in raw text are strong
  const labeled =
    /(?:품\s*명|불량\s*현상|부적합)\s*[:=\-–>]/i.test(r.raw) &&
    (hasProduct || hasDefectText);

  if (
    labeled &&
    (hasProduct || hasDefectText) &&
    (hasQty || hasProcess || hasPart || hasLot || (hasProduct && hasDefectText))
  ) {
    return true;
  }

  // Free-form: product + defect word
  if (hasProduct && hasDefectWord) return true;
  // defect word + quantity or process
  if (hasDefectWord && (hasQty || hasProcess)) return true;
  // product + quantity + process (+ optional action)
  if (hasProduct && hasQty && hasProcess) return true;
  if (hasDefectText && hasQty && hasProcess && hasAction) return true;

  return false;
}

/** Score raw chat text for QC relevance (higher = more likely NCR). */
export function scoreQualityMessage(
  text: string,
  opts: ParseOptions = {},
): {
  score: number;
  reasons: string[];
} {
  const prev = activeOpts;
  activeOpts = opts;
  try {
    const t = text.trim();
    const reasons: string[] = [];
    let score = 0;

    if (!t || t.length < 4) return { score: 0, reasons: ["too_short"] };

    // Noise / chitchat
    if (
      /^(네|넵|ㅇㅇ|확인|확인했습니다|알겠습니다|수고|점심|출근|퇴근|ㅋㅋ+|ㅎㅎ+|로맨|ㄱㅅ|감사)/i.test(
        t,
      ) &&
      t.length < 40
    ) {
      return { score: 0, reasons: ["chitchat"] };
    }

    if (/(?:품\s*명|제품명)\s*[:=\-–>]/i.test(t)) {
      score += 3;
      reasons.push("label_product");
    }
    if (/(?:불량\s*현상|부적합)\s*[:=\-–>]|#\s*부적합|#\s*NCR/i.test(t)) {
      score += 3;
      reasons.push("label_defect");
    }
    if (
      defectRe().test(t) ||
      /\bNG\b|설체결|설삽입|이음|격리\s*조치/i.test(t)
    ) {
      score += 2;
      reasons.push("defect_word");
    }
    if (/(?:\d+(?:[.,]\d+)?)\s*(?:EA|ea|개|pcs|PCS)(?=$|\s|[^\w])/i.test(t)) {
      score += 2;
      reasons.push("quantity");
    }
    if (
      /(?:#\s*\d+\s*공정|\d+\s*공정|\bP[-_]?\d+\b|공정\s*[#:\-]?\s*\S+)/i.test(t)
    ) {
      score += 2;
      reasons.push("process");
    }
    // Typical plant multiline report
    if (/^#\s*\d+\s*공정\s*$/m.test(t) && /^\d+\s*(?:ea|EA|개)\s*$/m.test(t)) {
      score += 2;
      reasons.push("plant_format");
    }
    if (/(?:로트|LOT)[-_]?\w+/i.test(t)) {
      score += 1;
      reasons.push("lot");
    }
    if (/(?:수량|불량\s*수)\s*[:=\-–>]/i.test(t)) {
      score += 1;
      reasons.push("label_qty");
    }

    // Terms confirmed by users in prior reviews (server passes lexicon)
    const models = opts.learnedVehicleModels || [];
    if (models.some((m) => new RegExp(`\\b${escapeRegExp(m)}\\b`, "i").test(t))) {
      score += 1;
      reasons.push("learned_model");
    }
    const products = opts.learnedProductNames || [];
    if (products.some((p) => t.includes(p))) {
      score += 1;
      reasons.push("learned_product");
    }

    // Lone weak words without other signals
    if (
      score <= 2 &&
      /^(?:공정|수량|로트|라인)\s*(?:확인|어때|어때요|어때용|어떻게|회의|진행)?\s*$/i.test(
        t,
      )
    ) {
      return { score: 0, reasons: ["weak_alone"] };
    }

    return { score, reasons };
  } finally {
    activeOpts = prev;
  }
}

/** Minimum score to even attempt NCR ingest from a busy group chat. */
export const QC_INGEST_SCORE_THRESHOLD = 4;

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
