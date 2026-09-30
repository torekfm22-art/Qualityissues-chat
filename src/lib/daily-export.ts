import { writeFileSync, existsSync } from "fs";
import path from "path";
import { dayKeyKst } from "./date-kst";
import { buildNcrExcelBuffer, flattenMessagesToRecords } from "./excel-buffer";
import {
  getExportsDir,
  getSettings,
  listMessages,
  updateSettings,
} from "./store";

export function exportFilePath(dayKey: string): string {
  return path.join(getExportsDir(), `품질부적합_${dayKey}.xlsx`);
}

export async function generateDailyExcel(dayKey = dayKeyKst()): Promise<{
  dayKey: string;
  count: number;
  filePath: string;
  bytes: Uint8Array;
}> {
  const messages = listMessages({ dayKey });
  const records = flattenMessagesToRecords(messages);
  const bytes = await buildNcrExcelBuffer(records, `품질부적합_${dayKey}`);
  const filePath = exportFilePath(dayKey);
  writeFileSync(filePath, bytes);
  return { dayKey, count: records.length, filePath, bytes };
}

export async function maybeRunScheduledDailyExport(
  now = new Date(),
): Promise<{ ran: boolean; dayKey?: string; count?: number }> {
  const settings = getSettings();
  if (!settings.autoExportEnabled) return { ran: false };

  const { toKstParts } = await import("./date-kst");
  const parts = toKstParts(now);
  const today = `${parts.year}-${parts.month}-${parts.day}`;

  // Seal previous day once we reach/pass export hour, or seal today after hour
  if (parts.hour < settings.exportHourKst) return { ran: false };
  if (settings.lastDailyExportDay === today) return { ran: false };

  const result = await generateDailyExcel(today);
  updateSettings({ lastDailyExportDay: today });
  return { ran: true, dayKey: result.dayKey, count: result.count };
}

export function dailyExportExists(dayKey: string): boolean {
  return existsSync(exportFilePath(dayKey));
}
