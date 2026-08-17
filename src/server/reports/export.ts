import ExcelJS from "exceljs";

export type ReportColumn = { header: string; key: string; width?: number };

/** Builds an RTL Excel workbook with a bold header row — the pattern already used by the daily-plan export. */
export async function buildExcelBuffer(
  sheetName: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // Excel sheet names can't exceed 31 chars or contain []:*?/\.
  const safeName = sheetName.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
  const sheet = workbook.addWorksheet(safeName, { views: [{ rightToLeft: true }] });
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Escapes one CSV field per RFC 4180. */
function csvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Builds a CSV string. Prefixed with a UTF-8 BOM so Hebrew text opens
 * correctly in Excel — without it, Excel guesses a Western codepage and the
 * Hebrew columns render as mojibake.
 */
export function buildCsv(columns: ReportColumn[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((c) => csvField(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvField(row[c.key])).join(","));
  }
  return "﻿" + lines.join("\r\n");
}

export function excelResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
