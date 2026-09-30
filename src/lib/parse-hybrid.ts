import {
  parseChatToNcr,
  QC_INGEST_SCORE_THRESHOLD,
  scoreQualityMessage,
  type ParseOptions,
} from "./parse-ncr";
import { assistParseNcr, type LlmAssistMode } from "./llm-ncr";
import type { NcrRecord } from "./types";
import {
  getLexicon,
  learnedProductNames,
  learnedVehicleModels,
} from "./training";

export type ParsePipelineSource = "pattern" | "llm" | "llm_mock" | "none";

export interface HybridParseResult {
  records: NcrRecord[];
  source: ParsePipelineSource;
  score: number;
  scoreReasons: string[];
  llmMode: LlmAssistMode;
  llmError?: string;
}

function learnedParseOptions(): ParseOptions {
  const lexicon = getLexicon();
  return {
    extraDefectTerms: lexicon.defectTerms,
    learnedVehicleModels: learnedVehicleModels(),
    learnedProductNames: learnedProductNames(),
  };
}

/**
 * Pattern first. If the message looks like QC but pattern yields nothing,
 * ask LLM (or local mock) for a second pass.
 * Uses confirmed training lexicon to sharpen pattern scoring/matching.
 */
export async function parseChatToNcrHybrid(
  text: string,
  opts?: { llmAssistEnabled?: boolean },
): Promise<HybridParseResult> {
  const parseOpts = learnedParseOptions();
  const relevance = scoreQualityMessage(text, parseOpts);
  const pattern = parseChatToNcr(text, parseOpts);
  if (pattern.length > 0) {
    return {
      records: pattern,
      source: "pattern",
      score: relevance.score,
      scoreReasons: relevance.reasons,
      llmMode: "off",
    };
  }

  const llmOn = opts?.llmAssistEnabled !== false;
  if (!llmOn || relevance.score < QC_INGEST_SCORE_THRESHOLD) {
    return {
      records: [],
      source: "none",
      score: relevance.score,
      scoreReasons: relevance.reasons,
      llmMode: "off",
    };
  }

  const assisted = await assistParseNcr(text, true);
  if (assisted.records.length === 0) {
    return {
      records: [],
      source: "none",
      score: relevance.score,
      scoreReasons: relevance.reasons,
      llmMode: assisted.mode,
      llmError: assisted.error,
    };
  }

  return {
    records: assisted.records,
    source: assisted.mode === "openai" ? "llm" : "llm_mock",
    score: relevance.score,
    scoreReasons: relevance.reasons,
    llmMode: assisted.mode,
    llmError: assisted.error,
  };
}
