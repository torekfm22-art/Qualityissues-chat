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

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const exportsDir = path.join(DATA_DIR, "exports");
  if (!existsSync(exportsDir)) mkdirSync(exportsDir, { recursive: true });
}

function readRaw(): StoreData {
  ensureDir();
  if (!existsSync(STORE_PATH)) {
    return { settings: { ...DEFAULT_SETTINGS }, messages: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8")) as StoreData;
    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, messages: [] };
  }
}

function writeRaw(data: StoreData) {
  ensureDir();
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmp, STORE_PATH);
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
