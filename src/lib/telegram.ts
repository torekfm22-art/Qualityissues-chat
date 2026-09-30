import { dayKeyKst, formatKstDisplay } from "./date-kst";
import {
  QC_INGEST_SCORE_THRESHOLD,
  scoreQualityMessage,
} from "./parse-ncr";
import { parseChatToNcrHybrid } from "./parse-hybrid";
import type { DiscoveredChat, MessageSource, StoredMessage } from "./models";
import {
  getSettings,
  resolveBotToken,
  updateSettings,
  upsertMessage,
} from "./store";
import {
  getLexicon,
  learnedProductNames,
  learnedVehicleModels,
} from "./training";
import { appendFileSync, mkdirSync, existsSync } from "fs";
import path from "path";

function logSkip(text: string, skipped: string, chatTitle: string) {
  try {
    const dir = path.join(process.cwd(), "data");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(
      path.join(dir, "skip-log.jsonl"),
      `${JSON.stringify({
        at: new Date().toISOString(),
        skipped,
        chatTitle,
        text: text.slice(0, 500),
      })}\n`,
      "utf8",
    );
  } catch {
    /* ignore */
  }
}

const TG_API = "https://api.telegram.org";

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  chat: { id: number; title?: string; type: string; username?: string };
  from?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
}

export interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  ip_address?: string;
}

function senderName(msg: TelegramMessage): string {
  const f = msg.from;
  if (!f) return "";
  return (
    [f.first_name, f.last_name].filter(Boolean).join(" ") || f.username || ""
  );
}

export async function telegramApi<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json()) as {
    ok: boolean;
    description?: string;
    result: T;
  };
  if (!json.ok) {
    throw new Error(json.description || `Telegram API ${method} failed`);
  }
  return json.result;
}

export function isAllowedChat(
  chatId: string | number,
  allowed: string[],
): boolean {
  if (!allowed.length) return true;
  const id = String(chatId);
  return allowed.some((a) => a.trim() === id);
}

export function rememberChat(msg: TelegramMessage): DiscoveredChat {
  const chat: DiscoveredChat = {
    chatId: String(msg.chat.id),
    title: msg.chat.title || msg.chat.username || String(msg.chat.id),
    type: msg.chat.type,
    lastSeenAt: new Date(msg.date * 1000).toISOString(),
  };
  const settings = getSettings();
  const others = settings.discoveredChats.filter((c) => c.chatId !== chat.chatId);
  updateSettings({ discoveredChats: [chat, ...others].slice(0, 50) });
  return chat;
}

async function maybeAckIngest(
  token: string,
  msg: TelegramMessage,
  ncrCount: number,
) {
  const settings = getSettings();
  if (!settings.replyOnIngest) return;
  try {
    await telegramApi(token, "sendMessage", {
      chat_id: msg.chat.id,
      text: `✅ 품질부적합 ${ncrCount}건 수집됨 (일일 엑셀에 반영)`,
      reply_to_message_id: msg.message_id,
      disable_notification: true,
    });
  } catch {
    // Ack failure must not block ingest
  }
}

export async function ingestTelegramMessage(
  msg: TelegramMessage,
  source: MessageSource = "telegram",
  opts?: { tokenForAck?: string },
): Promise<{
  inserted: boolean;
  message: StoredMessage | null;
  skipped?: string;
  parseSource?: string;
}> {
  rememberChat(msg);

  const text = (msg.text || msg.caption || "").trim();
  if (!text) return { inserted: false, message: null, skipped: "empty" };

  // Ignore bot command noise except /ncr style content after command
  if (/^\/(start|help|settings)\b/i.test(text)) {
    return { inserted: false, message: null, skipped: "command" };
  }

  const settings = getSettings();
  const chatId = String(msg.chat.id);
  if (!isAllowedChat(chatId, settings.telegramChatIds)) {
    return { inserted: false, message: null, skipped: "chat_not_allowed" };
  }

  const chatTitle = msg.chat.title || msg.chat.username || String(msg.chat.id);

  // Busy group filter: ignore chitchat / unrelated talk early
  // Include learned lexicon so confirmed field terms raise QC score over time
  const lexicon = getLexicon();
  const relevance = scoreQualityMessage(text, {
    extraDefectTerms: lexicon.defectTerms,
    learnedVehicleModels: learnedVehicleModels(),
    learnedProductNames: learnedProductNames(),
  });
  if (relevance.score < QC_INGEST_SCORE_THRESHOLD) {
    const skipped = `not_qc_score_${relevance.score}`;
    logSkip(text, `${skipped}:${relevance.reasons.join(",")}`, chatTitle);
    return { inserted: false, message: null, skipped };
  }

  const receivedAt = new Date(msg.date * 1000).toISOString();
  const sender = senderName(msg);
  const hybrid = await parseChatToNcrHybrid(
    `${sender ? `${sender} ${formatKstDisplay(receivedAt)}\n` : ""}${text}`,
    { llmAssistEnabled: settings.llmAssistEnabled !== false },
  );

  // Do not store weak/partial guesses — only confident NCR rows
  if (hybrid.records.length === 0) {
    logSkip(
      text,
      `not_qc_unparsed:score_${relevance.score}:llm_${hybrid.llmMode}`,
      chatTitle,
    );
    return { inserted: false, message: null, skipped: "not_qc_unparsed" };
  }

  const records = hybrid.records;
  const usedLlm = hybrid.source === "llm" || hybrid.source === "llm_mock";

  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    source,
    chatId,
    chatTitle,
    externalId: String(msg.message_id),
    sender,
    text,
    receivedAt,
    dayKey: dayKeyKst(new Date(receivedAt)),
    parsed: records,
    parseSource: hybrid.source,
    needsReview: usedLlm,
  };

  const result = upsertMessage(stored);
  if (result.inserted && opts?.tokenForAck) {
    void maybeAckIngest(opts.tokenForAck, msg, records.length);
  }
  return { ...result, parseSource: hybrid.source };
}

export async function pollTelegramUpdates(limit = 50): Promise<{
  processed: number;
  inserted: number;
  skipped: number;
  lastUpdateId: number;
  discovered: DiscoveredChat[];
}> {
  const settings = getSettings();
  const token = resolveBotToken(settings);
  if (!token) throw new Error("텔레그램 봇 토큰이 설정되지 않았습니다.");

  const offset = settings.lastPollUpdateId
    ? settings.lastPollUpdateId + 1
    : undefined;

  const updates = await telegramApi<TelegramUpdate[]>(token, "getUpdates", {
    offset,
    limit,
    timeout: 0,
    allowed_updates: ["message", "channel_post"],
  });

  let inserted = 0;
  let skipped = 0;
  let lastUpdateId = settings.lastPollUpdateId;

  for (const update of updates) {
    lastUpdateId = Math.max(lastUpdateId, update.update_id);
    const msg = update.message || update.channel_post;
    if (!msg) {
      skipped++;
      continue;
    }
    const result = await ingestTelegramMessage(msg, "telegram", {
      tokenForAck: token,
    });
    if (result.inserted) inserted++;
    else skipped++;
  }

  if (lastUpdateId !== settings.lastPollUpdateId) {
    updateSettings({ lastPollUpdateId: lastUpdateId });
  }

  return {
    processed: updates.length,
    inserted,
    skipped,
    lastUpdateId,
    discovered: getSettings().discoveredChats,
  };
}

export async function getBotProfile(token: string) {
  return telegramApi<{ id: number; username?: string; first_name: string }>(
    token,
    "getMe",
  );
}

export async function getWebhookInfo(token: string) {
  return telegramApi<WebhookInfo>(token, "getWebhookInfo");
}

export async function setWebhook(
  token: string,
  url: string,
  secret?: string,
) {
  return telegramApi<boolean>(token, "setWebhook", {
    url,
    secret_token: secret || undefined,
    allowed_updates: ["message", "channel_post"],
    drop_pending_updates: false,
  });
}

export async function deleteWebhook(token: string) {
  return telegramApi<boolean>(token, "deleteWebhook", {
    drop_pending_updates: false,
  });
}
