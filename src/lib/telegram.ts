import { dayKeyKst, formatKstDisplay } from "./date-kst";
import { parseChatToNcr } from "./parse-ncr";
import { emptyNcr } from "./types";
import type { MessageSource, StoredMessage } from "./models";
import { getSettings, resolveBotToken, upsertMessage } from "./store";

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
  from?: { id: number; first_name?: string; last_name?: string; username?: string };
}

function senderName(msg: TelegramMessage): string {
  const f = msg.from;
  if (!f) return "";
  return [f.first_name, f.last_name].filter(Boolean).join(" ") || f.username || "";
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
  const json = (await res.json()) as { ok: boolean; description?: string; result: T };
  if (!json.ok) {
    throw new Error(json.description || `Telegram API ${method} failed`);
  }
  return json.result;
}

export function isAllowedChat(chatId: string | number, allowed: string[]): boolean {
  if (!allowed.length) return true;
  const id = String(chatId);
  return allowed.some((a) => a.trim() === id);
}

export function ingestTelegramMessage(
  msg: TelegramMessage,
  source: MessageSource = "telegram",
): { inserted: boolean; message: StoredMessage | null; skipped?: string } {
  const text = (msg.text || msg.caption || "").trim();
  if (!text) return { inserted: false, message: null, skipped: "empty" };

  const settings = getSettings();
  const chatId = String(msg.chat.id);
  if (!isAllowedChat(chatId, settings.telegramChatIds)) {
    return { inserted: false, message: null, skipped: "chat_not_allowed" };
  }

  const receivedAt = new Date(msg.date * 1000).toISOString();
  const sender = senderName(msg);
  const parsed = parseChatToNcr(
    `${sender ? `${sender} ${formatKstDisplay(receivedAt)}\n` : ""}${text}`,
  );

  // If free-form QC keywords exist but parser returned empty, keep one shell record
  const looksLikeQc =
    /품명|불량|공정|부적합|NCR|로트|수량|스크래치|치수|찍힘|휨/i.test(text);
  const records =
    parsed.length > 0
      ? parsed
      : looksLikeQc
        ? [
            emptyNcr({
              reporter: sender,
              occurredAt: formatKstDisplay(receivedAt),
              note: "자동 필드 인식 실패 — 원문 보관",
              raw: text,
            }),
          ]
        : [];

  if (records.length === 0) {
    return { inserted: false, message: null, skipped: "not_qc" };
  }

  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    source,
    chatId,
    chatTitle: msg.chat.title || msg.chat.username || chatId,
    externalId: String(msg.message_id),
    sender,
    text,
    receivedAt,
    dayKey: dayKeyKst(new Date(receivedAt)),
    parsed: records,
  };

  return upsertMessage(stored);
}

export async function pollTelegramUpdates(limit = 50): Promise<{
  processed: number;
  inserted: number;
  skipped: number;
  lastUpdateId: number;
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
    const result = ingestTelegramMessage(msg);
    if (result.inserted) inserted++;
    else skipped++;
  }

  if (lastUpdateId !== settings.lastPollUpdateId) {
    const { updateSettings } = await import("./store");
    updateSettings({ lastPollUpdateId: lastUpdateId });
  }

  return {
    processed: updates.length,
    inserted,
    skipped,
    lastUpdateId,
  };
}

export async function getBotProfile(token: string) {
  return telegramApi<{ id: number; username?: string; first_name: string }>(
    token,
    "getMe",
  );
}
