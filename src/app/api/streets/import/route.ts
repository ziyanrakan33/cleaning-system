import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { setStreetGeometry } from "@/server/geo.service";

const TYPE_MAP: Record<string, string> = {
  "רחוב": "STREET",
  "שביל": "PATH",
  "מדרחוב": "PEDESTRIAN_MALL",
  "שטח ציבורי": "PUBLIC_AREA",
  "אחר": "OTHER",
};
const PRIORITY_MAP: Record<string, string> = {
  "קריטי": "CRITICAL",
  "גבוה": "HIGH",
  "רגיל": "NORMAL",
  "נמוך": "LOW",
};
const FREQUENCY_MAP: Record<string, string> = {
  "כל יום": "DAILY",
  "פעם בשבוע": "WEEKLY",
  "לפי צורך": "AS_NEEDED",
};

type ImportRow = {
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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const isCsv = file.name.toLowerCase().endsWith(".csv");
  // SheetJS's buffer reader assumes a legacy single-byte codepage for CSV
  // and mangles UTF-8 (Hebrew becomes mojibake) — decode as UTF-8 text
  // ourselves and hand it a string instead. Binary .xlsx files still need
  // the raw buffer path.
  const workbook = isCsv
    ? XLSX.read(buffer.toString("utf-8"), { type: "string" })
    : XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const rows: ImportRow[] = rawRows.map((raw) => {
    const row: ImportRow = {};
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

  const zones = await prisma.zone.findMany({ where: { active: true } });
  const zoneByName = new Map(zones.map((z) => [z.name, z.id]));

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // account for header row, 1-indexed
    if (!row.name) {
      errors.push(`שורה ${rowNum}: חסר שם רחוב`);
      continue;
    }

    const type = row.type ? TYPE_MAP[row.type] ?? "STREET" : "STREET";
    const priority = row.priority ? PRIORITY_MAP[row.priority] ?? "NORMAL" : "NORMAL";
    const frequencyType = row.frequency ? FREQUENCY_MAP[row.frequency] ?? "WEEKLY" : "WEEKLY";
    const zoneId = row.zone ? zoneByName.get(row.zone) ?? null : null;
    if (row.zone && !zoneId) errors.push(`שורה ${rowNum}: אזור "${row.zone}" לא נמצא — הרחוב יובא ללא שיוך`);

    const existing = await prisma.street.findFirst({ where: { name: row.name, source: "MANUAL" } });

    const data = {
      name: row.name,
      type: type as never,
      priority: priority as never,
      cleaningFrequency: { type: frequencyType },
      zoneId,
      estimatedCleanMinutes: row.cleanMinutes ?? null,
      notes: row.notes ?? null,
      source: "MANUAL" as const,
    };

    let streetId: string;
    if (existing) {
      await prisma.street.update({ where: { id: existing.id }, data });
      streetId = existing.id;
      updated++;
    } else {
      const created_ = await prisma.street.create({ data });
      streetId = created_.id;
      created++;
    }

    if (row.startLat && row.startLon && row.endLat && row.endLon) {
      try {
        await setStreetGeometry(streetId, [
          [row.startLon, row.startLat],
          [row.endLon, row.endLat],
        ]);
      } catch {
        errors.push(`שורה ${rowNum}: קואורדינטות לא תקינות`);
      }
    }
  }

  await prisma.importBatch.create({
    data: {
      type: "STREETS",
      filename: file.name,
      uploadedById: session.user.id,
      rowCount: rows.length,
      status: errors.length > 0 ? "PARTIAL" : "SUCCESS",
      errorLog: errors.length > 0 ? errors : undefined,
    },
  });

  return NextResponse.json({ created, updated, total: rows.length, errors });
}
