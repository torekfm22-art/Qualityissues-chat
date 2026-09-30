import ExcelJS from "exceljs";
import type { NcrRecord } from "./types";
import { NCR_COLUMNS } from "./types";
import type { StoredMessage } from "./models";

function toUint8Array(
  buffer: ArrayBuffer | ArrayBufferView | Uint8Array,
): Uint8Array {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  if (ArrayBuffer.isView(buffer)) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  return new Uint8Array(buffer as ArrayLike<number>);
}

export async function buildNcrExcelBuffer(
  records: NcrRecord[],
  sheetName = "품질부적합",
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "품질톡 정리기";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = [
    "No",
    "수집출처",
    "채팅방",
    ...NCR_COLUMNS.map((c) => c.label),
    "원문",
  ];
  sheet.addRow(headers);

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A4C" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  });

  records.forEach((r, i) => {
    const meta = r as NcrRecord & { _source?: string; _chatTitle?: string };
    const row = sheet.addRow([
      i + 1,
      meta._source ?? "",
      meta._chatTitle ?? "",
      ...NCR_COLUMNS.map((c) => r[c.key]),
      r.raw.replace(/\n/g, " / "),
    ]);
    row.eachCell((cell, col) => {
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: col === 1 ? "center" : "left",
      };
      if (i % 2 === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF0F7FA" },
        };
      }
    });
  });

  const widths = [6, 10, 16, 16, 10, 22, 14, 28, 14, 10, 16, 12, 20, 16, 40];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = toUint8Array(buffer as ArrayBuffer | ArrayBufferView);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function flattenMessagesToRecords(
  messages: StoredMessage[],
): Array<NcrRecord & { _source: string; _chatTitle: string }> {
  const out: Array<NcrRecord & { _source: string; _chatTitle: string }> = [];
  for (const m of messages) {
    const parsed =
      m.parsed.length > 0
        ? m.parsed
        : [
            {
              id: m.id,
              occurredAt: m.receivedAt,
              reporter: m.sender,
              productName: "",
              partNumber: "",
              defect: "",
              process: "",
              quantity: "",
              lot: "",
              line: "",
              action: "",
              note: "(파싱 실패 — 원문 확인)",
              raw: m.text,
            },
          ];
    for (const r of parsed) {
      out.push({
        ...r,
        reporter: r.reporter || m.sender,
        occurredAt: r.occurredAt || m.receivedAt,
        _source: m.source,
        _chatTitle: m.chatTitle,
      });
    }
  }
  return out;
}
