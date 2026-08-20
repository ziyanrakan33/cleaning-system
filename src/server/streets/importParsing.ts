/**
 * §4 — shared parsing/validation for the street Excel/CSV import, used by both
 * the preview endpoint (no writes) and the confirm endpoint (transactional
 * write) so the two can never disagree about what a row means.
 */
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

export const TYPE_MAP: Record<string, string> = {
  "רחוב": "STREET",
  "שביל": "PATH",
  "מדרחוב": "PEDESTRIAN_MALL",
  "שטח ציבורי": "PUBLIC_AREA",
  "אחר": "OTHER",
};
export const PRIORITY_MAP: Record<string, string> = {
  "קריטי": "CRITICAL",
  "גבוה": "HIGH",
  "רגיל": "NORMAL",
  "נמוך": "LOW",
};
export const FREQUENCY_MAP: Record<string, string> = {
  "כל יום": "DAILY",
  "פעם בשבוע": "WEEKLY",
  "לפי צורך": "AS_NEEDED",
};

export type ImportRow = {
  rowNum: number;
  name?: string;
  type?: string;
  zone?: string;
  priority?: string;
  frequency?: string;
  lengthM?: number;
  cleanMinutes?: number;
  notes?: string;
  startLat?: number;
  startLon?: number;
  endLat?: number;
  endLon?: number;
};

const HEADER_MAP: Record<string, keyof ImportRow> = {
  "שם": "name",
  "סוג": "type",
  "אזור": "zone",
  "עדיפות": "priority",
  "תדירות": "frequency",
  "אורך_מטר": "lengthM",
  "זמן_ניקיון_דקות": "cleanMinutes",
  "הערות": "notes",
  "קו_רוחב_התחלה": "startLat",
  "קו_אורך_התחלה": "startLon",
  "קו_רוחב_סיום": "endLat",
  "קו_אורך_סיום": "endLon",
};

/** Parses the uploaded file into rows. Throws nothing DB-related — pure parsing. */
export function parseImportWorkbook(buffer: Buffer, isCsv: boolean): ImportRow[] {
  // SheetJS's buffer reader assumes a legacy single-byte codepage for CSV and
  // mangles UTF-8 (Hebrew becomes mojibake) — decode as UTF-8 text ourselves
  // and hand it a string instead. Binary .xlsx files still need the raw buffer path.
  const workbook = isCsv
    ? XLSX.read(buffer.toString("utf-8"), { type: "string" })
    : XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rawRows.map((raw, i) => {
    const row: ImportRow = { rowNum: i + 2 }; // account for header row, 1-indexed
    for (const [header, value] of Object.entries(raw)) {
      const key = HEADER_MAP[header.trim()];
      if (!key) continue;
      if (["lengthM", "cleanMinutes", "startLat", "startLon", "endLat", "endLon"].includes(key)) {
        const num = Number(value);
        if (!Number.isNaN(num) && value !== "") (row as Record<string, unknown>)[key] = num;
      } else {
        const str = String(value).trim();
        if (str) (row as Record<string, unknown>)[key] = str;
      }
    }
    return row;
  });
}

export type PreviewEntry = {
  rowNum: number;
  name: string | null;
  action: "create" | "update" | "error";
  message?: string;
};

/**
 * Collapses whitespace and Hebrew final-letter forms (ך/ם/ן/ף/ץ → כ/מ/נ/פ/צ)
 * so "רחוב  הרצל" and "רחוב הרצל" — or a name typed with/without sofit forms
 * — match as the same street instead of silently creating a duplicate on
 * re-import (§IMP-02). Deliberately not a fuzzy/edit-distance match: that
 * risks merging two genuinely different streets, which is worse than an
 * occasional missed duplicate a human can still catch in the preview.
 */
export function normalizeStreetName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[ךםןףץ]/g, (c) => ({ ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" })[c]!);
}

/** Looks up the real (un-normalized) existing street name/id for a normalized key. */
export async function buildExistingStreetIndex(): Promise<Map<string, { id: string; name: string }>> {
  const existing = await prisma.street.findMany({ where: { source: "MANUAL" }, select: { id: true, name: true } });
  const index = new Map<string, { id: string; name: string }>();
  for (const s of existing) index.set(normalizeStreetName(s.name), { id: s.id, name: s.name });
  return index;
}

/** Validates rows against current DB state (zones, existing streets) without writing anything. */
export async function buildImportPreview(rows: ImportRow[]): Promise<PreviewEntry[]> {
  const zones = await prisma.operationalZone.findMany({ where: { active: true }, select: { name: true } });
  const zoneNames = new Set(zones.map((z) => z.name));
  const existingIndex = await buildExistingStreetIndex();

  return rows.map((row) => {
    if (!row.name) return { rowNum: row.rowNum, name: null, action: "error", message: "חסר שם רחוב" };
    const warnings: string[] = [];
    if (row.zone && !zoneNames.has(row.zone)) warnings.push(`אזור "${row.zone}" לא נמצא — ייובא ללא שיוך`);
    if (row.startLat != null && (!row.startLon || !row.endLat || !row.endLon)) {
      warnings.push("קואורדינטות חלקיות — הגיאומטריה לא תיובא");
    }
    const match = existingIndex.get(normalizeStreetName(row.name));
    if (match && match.name !== row.name) warnings.push(`דומה לרחוב קיים "${match.name}" — יעודכן אותו רחוב`);
    return {
      rowNum: row.rowNum,
      name: row.name,
      action: match ? "update" : "create",
      message: warnings.length ? warnings.join("; ") : undefined,
    };
  });
}
