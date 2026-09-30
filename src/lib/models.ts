import type { NcrRecord } from "./types";

export type MessageSource = "telegram" | "kakao" | "manual" | "demo";

export interface StoredMessage {
  id: string;
  source: MessageSource;
  chatId: string;
  chatTitle: string;
  externalId: string;
  sender: string;
  text: string;
  receivedAt: string; // ISO
  dayKey: string; // YYYY-MM-DD in Asia/Seoul
  parsed: NcrRecord[];
}

export interface DiscoveredChat {
  chatId: string;
  title: string;
  type: string;
  lastSeenAt: string;
}

export interface AppSettings {
  telegramBotToken: string;
  telegramChatIds: string[]; // empty = accept all
  telegramWebhookSecret: string;
  exportHourKst: number; // 0-23, when daily excel is sealed
  autoExportEnabled: boolean;
  replyOnIngest: boolean;
  lastPollUpdateId: number;
  lastDailyExportDay: string;
  discoveredChats: DiscoveredChat[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  telegramBotToken: "",
  telegramChatIds: [],
  telegramWebhookSecret: "",
  exportHourKst: 23,
  autoExportEnabled: true,
  replyOnIngest: true,
  lastPollUpdateId: 0,
  lastDailyExportDay: "",
  discoveredChats: [],
};

export interface StoreData {
  settings: AppSettings;
  messages: StoredMessage[];
}
