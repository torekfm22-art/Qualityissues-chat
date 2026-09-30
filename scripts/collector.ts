/**
 * Long-running Telegram collector + daily Excel sealer.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=... npm run collector
 *
 * Keeps polling getUpdates and writes daily Excel under data/exports/
 * when the configured KST export hour is reached.
 */

import { pollTelegramUpdates } from "../src/lib/telegram";
import { maybeRunScheduledDailyExport } from "../src/lib/daily-export";
import { getSettings, resolveBotToken } from "../src/lib/store";

const POLL_MS = Number(process.env.COLLECTOR_POLL_MS || 3000);

async function tick() {
  const settings = getSettings();
  const token = resolveBotToken(settings);
  if (!token) {
    console.warn(
      "[collector] No TELEGRAM_BOT_TOKEN / settings token. Idle — set token or use demo ingest in UI.",
    );
    await maybeRunScheduledDailyExport();
    return;
  }

  try {
    const result = await pollTelegramUpdates(50);
    if (result.processed > 0) {
      console.log(
        `[collector] updates=${result.processed} inserted=${result.inserted} skipped=${result.skipped}`,
      );
    }
  } catch (e) {
    console.error("[collector] poll error", e instanceof Error ? e.message : e);
  }

  try {
    const scheduled = await maybeRunScheduledDailyExport();
    if (scheduled.ran) {
      console.log(
        `[collector] daily excel sealed day=${scheduled.dayKey} rows=${scheduled.count}`,
      );
    }
  } catch (e) {
    console.error(
      "[collector] daily export error",
      e instanceof Error ? e.message : e,
    );
  }
}

console.log("[collector] started — polling Telegram every", POLL_MS, "ms");
await tick();
setInterval(() => {
  void tick();
}, POLL_MS);
