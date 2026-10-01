import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "fs";
import path from "path";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type StoredMessage,
  type StoreData,
} from "./models";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const SECRETS_PATH = path.join(DATA_DIR, "secrets.json");

type LocalSecrets = {
  telegramBotToken: string;
  telegramWebhookSecret: string;
};

const EMPTY_SECRETS: LocalSecrets = {
  telegramBotToken: "",
  telegramWebhookSecret: "",
};

function ensureDir() {
  for (const dir of [
    DATA_DIR,
    path.join(DATA_DIR, "exports"),
    path.join(DATA_DIR, "training"),
  ]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

function readSecrets(): LocalSecrets {
  if (!existsSync(SECRETS_PATH)) return { ...EMPTY_SECRETS };
  try {
    const parsed = JSON.parse(readFileSync(SECRETS_PATH, "utf8")) as Partial<LocalSecrets>;
    return {
      telegramBotToken: parsed.telegramBotToken?.trim() || "",
      telegramWebhookSecret: parsed.telegramWebhookSecret?.trim() || "",
    };
  } catch {
    return { ...EMPTY_SECRETS };
  }
}

function writeSecrets(secrets: LocalSecrets) {
  ensureDir();
  const tmp = `${SECRETS_PATH}.${process.pid}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify(
      {
        telegramBotToken: secrets.telegramBotToken.trim(),
        telegramWebhookSecret: secrets.telegramWebhookSecret.trim(),
      },
      null,
      2,
    ),
    "utf8",
  );
  renameSync(tmp, SECRETS_PATH);
}

function withoutSecrets(settings: AppSettings): AppSettings {
  return { ...settings, telegramBotToken: "", telegramWebhookSecret: "" };
}

function writeStoreFile(data: StoreData) {
  ensureDir();
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify(
      { settings: withoutSecrets(data.settings), messages: data.messages },
      null,
      2,
    ),
    "utf8",
  );
  renameSync(tmp, STORE_PATH);
}

function readRaw(): StoreData {
  ensureDir();
  let stored: StoreData = { settings: { ...DEFAULT_SETTINGS }, messages: [] };
  if (existsSync(STORE_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8")) as StoreData;
      stored = {
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      };
    } catch {
      stored = { settings: { ...DEFAULT_SETTINGS }, messages: [] };
    }
  }

  const secrets = readSecrets();
  const legacyToken = stored.settings.telegramBotToken?.trim() || "";
  const legacySecret = stored.settings.telegramWebhookSecret?.trim() || "";
  const telegramBotToken = secrets.telegramBotToken || legacyToken;
  const telegramWebhookSecret = secrets.telegramWebhookSecret || legacySecret;

  if (legacyToken || legacySecret) {
    writeSecrets({ telegramBotToken, telegramWebhookSecret });
    writeStoreFile({ settings: stored.settings, messages: stored.messages });
  }

  return {
    settings: { ...stored.settings, telegramBotToken, telegramWebhookSecret },
    messages: stored.messages,
  };
}

function writeRaw(data: StoreData) {
  writeSecrets({
    telegramBotToken: data.settings.telegramBotToken || "",
    telegramWebhookSecret: data.settings.telegramWebhookSecret || "",
  });
  writeStoreFile(data);
}

export function getStore(): StoreData {
  return readRaw();
}

export function getSettings(): AppSettings {
  return readRaw().settings;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const data = readRaw();
  data.settings = { ...data.settings, ...patch };
  writeRaw(data);
  return data.settings;
}

export function listMessages(opts?: {
  dayKey?: string;
  source?: string;
  limit?: number;
}): StoredMessage[] {
  const { messages } = readRaw();
  let list = [...messages].sort((a, b) =>
    a.receivedAt < b.receivedAt ? 1 : -1,
  );
  if (opts?.dayKey) list = list.filter((m) => m.dayKey === opts.dayKey);
  if (opts?.source) list = list.filter((m) => m.source === opts.source);
  if (opts?.limit) list = list.slice(0, opts.limit);
  return list;
}

export function upsertMessage(message: StoredMessage): {
  inserted: boolean;
  message: StoredMessage;
} {
  const data = readRaw();
  const idx = data.messages.findIndex(
    (m) =>
      m.source === message.source &&
      m.chatId === message.chatId &&
      m.externalId === message.externalId,
  );
  if (idx >= 0) {
    data.messages[idx] = { ...data.messages[idx], ...message, id: data.messages[idx].id };
    writeRaw(data);
    return { inserted: false, message: data.messages[idx] };
  }
  data.messages.push(message);
  writeRaw(data);
  return { inserted: true, message };
}

export function clearMessages(dayKey?: string): number {
  const data = readRaw();
  const before = data.messages.length;
  data.messages = dayKey
    ? data.messages.filter((m) => m.dayKey !== dayKey)
    : [];
  writeRaw(data);
  return before - data.messages.length;
}

export function getMessageById(id: string): StoredMessage | null {
  return readRaw().messages.find((m) => m.id === id) ?? null;
}

export function updateMessageById(
  id: string,
  patch: Partial<StoredMessage>,
): StoredMessage | null {
  const data = readRaw();
  const idx = data.messages.findIndex((m) => m.id === id);
  if (idx < 0) return null;
  data.messages[idx] = { ...data.messages[idx], ...patch, id };
  writeRaw(data);
  return data.messages[idx];
}

export function getExportsDir(): string {
  ensureDir();
  return path.join(DATA_DIR, "exports");
}

export function resolveBotToken(settings?: AppSettings): string {
  const s = settings ?? getSettings();
  return (
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    s.telegramBotToken?.trim() ||
    ""
  );
}
