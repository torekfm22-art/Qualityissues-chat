import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { NCR_COLUMNS, type NcrRecord } from "./types";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function exportNcrToExcel(
  records: NcrRecord[],
  filename?: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "품질톡 정리기";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("품질부적합", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = ["No", ...NCR_COLUMNS.map((c) => c.label), "원문"];
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
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF0F2430" } },
    };
  });

  records.forEach((r, i) => {
    const row = sheet.addRow([
      i + 1,
      ...NCR_COLUMNS.map((c) => r[c.key]),
      r.raw.replace(/\n/g, " / "),
    ]);
    row.eachCell((cell, col) => {
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: col === 1 ? "center" : "left",
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
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

  const widths = [6, 16, 10, 22, 14, 28, 14, 10, 16, 12, 20, 16, 40];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, filename ?? `품질부적합_${stamp()}.xlsx`);
}
