import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import path from "path";
import type { NcrRecord } from "./types";
import type { ParsePipelineSource } from "./models";

const TRAINING_DIR = path.join(process.cwd(), "data", "training");
const SAMPLES_PATH = path.join(TRAINING_DIR, "samples.jsonl");
const LEXICON_PATH = path.join(TRAINING_DIR, "lexicon.json");

export interface TrainingSample {
  id: string;
  at: string;
  messageId: string;
  text: string;
  before?: Partial<NcrRecord>;
  after: Partial<NcrRecord>;
  parseSource?: ParsePipelineSource;
  kind: "confirm" | "correct";
}

export interface LearnedLexicon {
  updatedAt: string;
  vehicleModels: string[];
  productNames: string[];
  defectTerms: string[];
  sampleCount: number;
}

const EMPTY_LEXICON: LearnedLexicon = {
  updatedAt: "",
  vehicleModels: [],
  productNames: [],
  defectTerms: [],
  sampleCount: 0,
};

function ensureDir() {
  if (!existsSync(TRAINING_DIR)) mkdirSync(TRAINING_DIR, { recursive: true });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickFields(r: Partial<NcrRecord>): Partial<NcrRecord> {
  return {
    vehicleModel: r.vehicleModel?.trim() || "",
    productName: r.productName?.trim() || "",
    partNumber: r.partNumber?.trim() || "",
    defect: r.defect?.trim() || "",
    process: r.process?.trim() || "",
    quantity: r.quantity?.trim() || "",
    lot: r.lot?.trim() || "",
    line: r.line?.trim() || "",
    action: r.action?.trim() || "",
    note: (r.note || "").replace(/\s*〔[^〕]+〕/g, "").trim(),
    reporter: r.reporter?.trim() || "",
    occurredAt: r.occurredAt?.trim() || "",
  };
}

/** Extract short defect cue words from a free-form defect string. */
function extractDefectTerms(defect: string): string[] {
  const t = defect.trim();
  if (!t || t.length > 40) return [];
  const out = new Set<string>();
  // Whole short phrase
  if (t.length <= 24 && !/\s{2,}/.test(t)) out.add(t);
  // Known-ish tokens / NG phrases
  const tokens = t.match(
    /[가-힣A-Za-z]{2,}(?:\s*NG)?|\bNG\b|설체결|설삽입|오체결|미체결|오삽입|미삽입|이음/gi,
  );
  for (const tok of tokens || []) {
    const v = tok.trim();
    if (v.length >= 2 && v.length <= 20) out.add(v);
  }
  return [...out];
}

export function listTrainingSamples(limit = 200): TrainingSample[] {
  ensureDir();
  if (!existsSync(SAMPLES_PATH)) return [];
  const lines = readFileSync(SAMPLES_PATH, "utf8").trim().split("\n").filter(Boolean);
  const samples: TrainingSample[] = [];
  for (let i = lines.length - 1; i >= 0 && samples.length < limit; i--) {
    try {
      samples.push(JSON.parse(lines[i]) as TrainingSample);
    } catch {
      /* skip bad line */
    }
  }
  return samples;
}

export function getLexicon(): LearnedLexicon {
  ensureDir();
  if (!existsSync(LEXICON_PATH)) return { ...EMPTY_LEXICON };
  try {
    return {
      ...EMPTY_LEXICON,
      ...(JSON.parse(readFileSync(LEXICON_PATH, "utf8")) as LearnedLexicon),
    };
  } catch {
    return { ...EMPTY_LEXICON };
  }
}

export function rebuildLexicon(): LearnedLexicon {
  ensureDir();
  const samples = listTrainingSamples(2000);
  const vehicleModels = new Set<string>();
  const productNames = new Set<string>();
  const defectTerms = new Set<string>();

  for (const s of samples) {
    const a = s.after;
    if (a.vehicleModel) vehicleModels.add(a.vehicleModel.toUpperCase());
    if (a.productName) productNames.add(a.productName);
    if (a.defect) {
      for (const term of extractDefectTerms(a.defect)) defectTerms.add(term);
    }
  }

  const lexicon: LearnedLexicon = {
    updatedAt: new Date().toISOString(),
    vehicleModels: [...vehicleModels].sort(),
    productNames: [...productNames].sort(),
    defectTerms: [...defectTerms].sort(),
    sampleCount: samples.length,
  };

  const tmp = `${LEXICON_PATH}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(lexicon, null, 2), "utf8");
  renameSync(tmp, LEXICON_PATH);
  return lexicon;
}

export function appendTrainingSample(input: {
  messageId: string;
  text: string;
  before?: Partial<NcrRecord>;
  after: Partial<NcrRecord>;
  parseSource?: ParsePipelineSource;
  kind: "confirm" | "correct";
}): { sample: TrainingSample; lexicon: LearnedLexicon } {
  ensureDir();
  const sample: TrainingSample = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    messageId: input.messageId,
    text: input.text.slice(0, 2000),
    before: input.before ? pickFields(input.before) : undefined,
    after: pickFields(input.after),
    parseSource: input.parseSource,
    kind: input.kind,
  };
  appendFileSync(SAMPLES_PATH, `${JSON.stringify(sample)}\n`, "utf8");
  const lexicon = rebuildLexicon();
  return { sample, lexicon };
}

/** Recent confirmed/corrected examples for LLM few-shot prompts. */
export function getFewShotExamples(limit = 6): {
  text: string;
  after: Partial<NcrRecord>;
}[] {
  return listTrainingSamples(80)
    .filter((s) => s.after.productName || s.after.defect || s.after.vehicleModel)
    .slice(0, limit)
    .map((s) => ({ text: s.text, after: s.after }));
}

/** Extra defect alternation fragment for merging into the base regex. */
export function learnedDefectAlternation(): string {
  const terms = getLexicon().defectTerms;
  if (!terms.length) return "";
  return terms.map(escapeRegExp).join("|");
}

export function learnedVehicleModels(): string[] {
  return getLexicon().vehicleModels;
}

export function learnedProductNames(): string[] {
  return getLexicon().productNames;
}

export function trainingStats() {
  const lexicon = getLexicon();
  const recent = listTrainingSamples(10);
  return {
    sampleCount: lexicon.sampleCount || listTrainingSamples(5000).length,
    lexicon,
    recent,
  };
}
