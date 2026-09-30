import {
  parseChatToNcr,
  QC_INGEST_SCORE_THRESHOLD,
  scoreQualityMessage,
} from "./parse-ncr";
import { assistParseNcr, type LlmAssistMode } from "./llm-ncr";
import type { NcrRecord } from "./types";

export type ParsePipelineSource = "pattern" | "llm" | "llm_mock" | "none";

export interface HybridParseResult {
  records: NcrRecord[];
  source: ParsePipelineSource;
  score: number;
  scoreReasons: string[];
  llmMode: LlmAssistMode;
  llmError?: string;
}

/**
 * Pattern first. If the message looks like QC but pattern yields nothing,
 * ask LLM (or local mock) for a second pass.
 */
export async function parseChatToNcrHybrid(
  text: string,
  opts?: { llmAssistEnabled?: boolean },
): Promise<HybridParseResult> {
  const relevance = scoreQualityMessage(text);
  const pattern = parseChatToNcr(text);
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
