import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { parseChatToNcr, scoreQualityMessage } from "../src/lib/parse-ncr";
import { upsertMessage, listMessages } from "../src/lib/store";
import { dayKeyKst } from "../src/lib/date-kst";
import {
  buildNcrExcelBuffer,
  flattenMessagesToRecords,
} from "../src/lib/excel-buffer";
import type { StoredMessage } from "../src/lib/models";

async function main() {
  const skipPath = path.join(process.cwd(), "data/skip-log.jsonl");
  const lines = readFileSync(skipPath, "utf8").trim().split("\n").filter(Boolean);
  const seen = new Set<string>();
  const unique: { text: string; chatTitle: string; at: string }[] = [];
  for (const line of lines) {
    const row = JSON.parse(line) as {
      text: string;
      chatTitle: string;
      at: string;
      skipped: string;
    };
    const key = row.text.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ text: key, chatTitle: row.chatTitle, at: row.at });
  }

  const chatId = "-5570933596";
  let inserted = 0;
  let updated = 0;
  const results: Record<string, unknown>[] = [];

  unique.forEach((row, i) => {
    const score = scoreQualityMessage(row.text);
    const receivedAt = row.at;
    const parsed = parseChatToNcr(row.text);
    if (!parsed.length) {
      results.push({ i, ok: false, score, text: row.text.slice(0, 60) });
      return;
    }
    const stored: StoredMessage = {
      id: crypto.randomUUID(),
      source: "telegram",
      chatId,
      chatTitle: row.chatTitle || "품질이슈 공유(Test)",
      externalId: `skip-reprocess-${i + 1}-${Buffer.from(row.text).toString("base64url").slice(0, 24)}`,
      sender: "",
      text: row.text,
      receivedAt,
      dayKey: dayKeyKst(new Date(receivedAt)),
      parsed,
    };
    const res = upsertMessage(stored);
    if (res.inserted) inserted++;
    else updated++;
    results.push({
      i,
      ok: true,
      inserted: res.inserted,
      model: parsed[0].vehicleModel,
      product: parsed[0].productName,
      defect: parsed[0].defect,
      process: parsed[0].process,
      qty: parsed[0].quantity,
      action: parsed[0].action,
    });
  });

  console.log(
    JSON.stringify({ unique: unique.length, inserted, updated, results }, null, 2),
  );

  const tg = listMessages({ source: "telegram", dayKey: dayKeyKst() });
  const records = flattenMessagesToRecords(tg);
  const bytes = await buildNcrExcelBuffer(records, "텔레그램테스트");
  const outDir = path.join(process.cwd(), "data/exports");
  const artDir = "/opt/cursor/artifacts";
  if (!existsSync(artDir)) mkdirSync(artDir, { recursive: true });
  const name = `품질부적합_텔레그램테스트_${dayKeyKst()}.xlsx`;
  writeFileSync(path.join(outDir, name), bytes);
  writeFileSync(path.join(artDir, name), bytes);
  console.log(
    JSON.stringify(
      { telegramMessages: tg.length, records: records.length, file: name },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
