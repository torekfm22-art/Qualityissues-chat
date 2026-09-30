import { dayKeyKst, formatKstDisplay } from "./date-kst";
import { parseChatToNcr } from "./parse-ncr";
import type { StoredMessage } from "./models";
import { upsertMessage } from "./store";

/**
 * Parse KakaoTalk "대화 내용 내보내기" text exports.
 * Official Kakao clients can export room history to .txt — there is no
 * public API to read ordinary KakaoTalk group rooms from third-party apps.
 */
export function splitKakaoExport(text: string): {
  roomTitle: string;
  blocks: { sender: string; timeLabel: string; body: string }[];
} {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  let roomTitle = "카카오톡";
  const titleLine = lines.find((l) => /님과 카카오톡 대화|카카오톡 대화/.test(l));
  if (titleLine) {
    roomTitle = titleLine.replace(/\s*님과 카카오톡 대화.*$/, "").trim() || roomTitle;
  }

  const blocks: { sender: string; timeLabel: string; body: string }[] = [];
  let current: { sender: string; timeLabel: string; body: string[] } | null =
    null;

  const header =
    /^(.+?)\s+(오[전후]\s+\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)$/;
  const dateBanner =
    /^-*\s*\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일(?:\s*\S+)?\s*-*$/;

  const flush = () => {
    if (!current) return;
    const body = current.body.join("\n").trim();
    if (body) {
      blocks.push({
        sender: current.sender,
        timeLabel: current.timeLabel,
        body,
      });
    }
    current = null;
  };

  let lastDate = "";
  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (dateBanner.test(trimmed)) {
      lastDate = trimmed.replace(/^-+\s*|\s*-+$/g, "").trim();
      flush();
      continue;
    }
    if (/님과 카카오톡 대화|저장한 날짜/.test(trimmed)) continue;

    const m = trimmed.match(header);
    if (m) {
      flush();
      current = {
        sender: m[1],
        timeLabel: lastDate ? `${lastDate} ${m[2]}` : m[2],
        body: [],
      };
      continue;
    }
    if (current) current.body.push(line);
  }
  flush();

  return { roomTitle, blocks };
}

export function ingestKakaoExport(
  text: string,
  opts?: { chatId?: string; fileName?: string },
): { inserted: number; skipped: number; roomTitle: string } {
  const { roomTitle, blocks } = splitKakaoExport(text);
  const chatId = opts?.chatId || opts?.fileName || roomTitle;
  let inserted = 0;
  let skipped = 0;

  blocks.forEach((block, index) => {
    const parsed = parseChatToNcr(
      `${block.sender} ${block.timeLabel}\n${block.body}`,
    );
    const looksLikeQc =
      /품명|불량|공정|부적합|NCR|로트|수량|스크래치|치수|찍힘|휨/i.test(
        block.body,
      );
    if (parsed.length === 0 && !looksLikeQc) {
      skipped++;
      return;
    }

    const receivedAt = new Date().toISOString();
    const message: StoredMessage = {
      id: crypto.randomUUID(),
      source: "kakao",
      chatId: String(chatId),
      chatTitle: roomTitle,
      externalId: `kakao-${index}-${hashText(block.body)}`,
      sender: block.sender,
      text: block.body,
      receivedAt,
      dayKey: dayKeyKst(),
      parsed:
        parsed.length > 0
          ? parsed.map((p) => ({
              ...p,
              reporter: p.reporter || block.sender,
              occurredAt: p.occurredAt || block.timeLabel || formatKstDisplay(receivedAt),
            }))
          : [],
    };

    const result = upsertMessage(message);
    if (result.inserted) inserted++;
    else skipped++;
  });

  return { inserted, skipped, roomTitle };
}

function hashText(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
