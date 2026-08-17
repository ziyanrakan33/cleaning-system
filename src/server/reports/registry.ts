import { parseDateOnly, addDaysToDateOnly } from "@/server/dateUtils";
import type { ReportResult } from "./queries-execution";
import {
  byResourceReport,
  byWorkerReport,
  hoursPlannedVsActualReport,
  kmPlannedVsActualReport,
  monthlyContractorReport,
  shiftReport,
  streetsCompletionReport,
  weeklyZoneReport,
  zoneVehiclesReport,
} from "./queries-execution";
import { cityCoverageReport, defectsReport, qualityControlReport, resourceUtilizationReport } from "./queries-quality";
import { pendingVerificationReport, sourceConflictsReport } from "./queries-sources";
import { monthBounds, parseYearMonth } from "./shared";

export type ReportContext = { showMoney: boolean };

/**
 * One entry per exportable report. `run` is intentionally loosely typed (glue
 * code dispatching to the strongly-typed query functions above) — the
 * strictness lives in queries-*.ts, not in this routing table.
 */
export type ReportEntry = {
  id: string;
  title: string;
  sheetName: string;
  /** Returns null when a required param is missing or malformed. */
  parseParams: (sp: URLSearchParams) => Record<string, unknown> | null;
  run: (params: Record<string, unknown>, ctx: ReportContext) => Promise<ReportResult>;
};

function reqDate(sp: URLSearchParams, key: string): Date | null {
  const v = sp.get(key);
  if (!v) return null;
  try {
    return parseDateOnly(v);
  } catch {
    return null;
  }
}

function reqRange(sp: URLSearchParams): { from: Date; to: Date } | null {
  const from = reqDate(sp, "from");
  const to = reqDate(sp, "to");
  if (!from || !to || from.getTime() > to.getTime()) return null;
  return { from, to };
}

export const REPORTS: ReportEntry[] = [
  {
    id: "weekly-zone",
    title: "דוח שבועי לפי אזור",
    sheetName: "שבועי לפי אזור",
    parseParams: (sp) => {
      const start = reqDate(sp, "start");
      if (!start) return null;
      return { from: start, to: addDaysToDateOnly(start, 6) };
    },
    run: (p) => weeklyZoneReport(p.from as Date, p.to as Date),
  },
  {
    id: "monthly-contractor",
    title: "דוח חודשי לפי קבלן",
    sheetName: "חודשי לפי קבלן",
    parseParams: (sp) => {
      const month = sp.get("month");
      if (!month) return null;
      try {
        const { year, month1to12 } = parseYearMonth(month);
        const { from, to } = monthBounds(year, month1to12);
        return { from, to };
      } catch {
        return null;
      }
    },
    run: (p, ctx) => monthlyContractorReport(p.from as Date, p.to as Date, ctx.showMoney),
  },
  {
    id: "by-resource",
    title: "דוח לפי כלי רכב / מספר רישוי",
    sheetName: "לפי כלי",
    parseParams: (sp) => {
      const resourceId = sp.get("resourceId");
      const range = reqRange(sp);
      if (!resourceId || !range) return null;
      return { resourceId, ...range };
    },
    run: (p) => byResourceReport(p.resourceId as string, p.from as Date, p.to as Date),
  },
  {
    id: "by-worker",
    title: "דוח לפי מנהל עבודה / נהג",
    sheetName: "לפי מנהל עבודה",
    parseParams: (sp) => {
      const userId = sp.get("userId");
      const range = reqRange(sp);
      if (!userId || !range) return null;
      return { userId, ...range };
    },
    run: (p) => byWorkerReport(p.userId as string, p.from as Date, p.to as Date),
  },
  {
    id: "shift",
    title: "דוח משמרת",
    sheetName: "דוח משמרת",
    parseParams: (sp) => {
      const shiftType = sp.get("shiftType");
      const date = reqDate(sp, "date");
      if (!shiftType || !date) return null;
      return { shiftType, date };
    },
    run: (p) => shiftReport(p.shiftType as string, p.date as Date),
  },
  {
    id: "zone-vehicles",
    title: "כלי רכב שעבדו בכל אזור",
    sheetName: "כלים לפי אזור",
    parseParams: (sp) => {
      const date = reqDate(sp, "date");
      if (!date) return null;
      return { date };
    },
    run: (p) => zoneVehiclesReport(p.date as Date),
  },
  {
    id: "hours",
    title: "שעות עבודה מתוכננות מול בפועל",
    sheetName: "שעות מתוכנן-בפועל",
    parseParams: (sp) => reqRange(sp),
    run: (p) => hoursPlannedVsActualReport(p.from as Date, p.to as Date),
  },
  {
    id: "streets-completion",
    title: "רחובות שבוצעו / לא בוצעו",
    sheetName: "ביצוע רחובות",
    parseParams: (sp) => {
      const range = reqRange(sp);
      if (!range) return null;
      const zoneId = sp.get("zoneId") || null;
      const result = (sp.get("result") as "all" | "done" | "not-done") || "all";
      return { ...range, zoneId, result };
    },
    run: (p) => streetsCompletionReport(p.from as Date, p.to as Date, p.zoneId as string | null, p.result as "all" | "done" | "not-done"),
  },
  {
    id: "km",
    title: 'קילומטרים מתוכננים מול מבוצעים',
    sheetName: "קמ מתוכנן-בפועל",
    parseParams: (sp) => {
      const range = reqRange(sp);
      if (!range) return null;
      const groupBy = (sp.get("groupBy") as "zone" | "contractor") || "zone";
      return { ...range, groupBy };
    },
    run: (p) => kmPlannedVsActualReport(p.from as Date, p.to as Date, p.groupBy as "zone" | "contractor"),
  },
  {
    id: "defects",
    title: "דוח ליקויים פתוחים וסגורים",
    sheetName: "ליקויים",
    parseParams: (sp) => {
      const range = reqRange(sp);
      if (!range) return null;
      return { ...range, zoneId: sp.get("zoneId") || null, contractAreaId: sp.get("contractAreaId") || null, status: sp.get("status") || null };
    },
    run: (p, ctx) =>
      defectsReport({
        from: p.from as Date,
        to: p.to as Date,
        zoneId: p.zoneId as string | null,
        contractAreaId: p.contractAreaId as string | null,
        status: p.status as string | null,
        showMoney: ctx.showMoney,
      }),
  },
  {
    id: "quality-control",
    title: "דוח בקרת איכות",
    sheetName: "בקרת איכות",
    parseParams: (sp) => reqRange(sp),
    run: (p) => qualityControlReport(p.from as Date, p.to as Date),
  },
  {
    id: "resource-utilization",
    title: "דוח ניצול משאבים מול ההסכם",
    sheetName: "ניצול משאבים",
    parseParams: (sp) => {
      const month = sp.get("month");
      if (!month) return null;
      try {
        const { year, month1to12 } = parseYearMonth(month);
        const { from, to } = monthBounds(year, month1to12);
        return { from, to, contractAreaId: sp.get("contractAreaId") || null };
      } catch {
        return null;
      }
    },
    run: (p) => resourceUtilizationReport(p.from as Date, p.to as Date, p.contractAreaId as string | null),
  },
  {
    id: "city-coverage",
    title: "דוח כיסוי עירוני",
    sheetName: "כיסוי עירוני",
    parseParams: (sp) => {
      const date = reqDate(sp, "date");
      return { date: date ?? new Date() };
    },
    run: (p) => cityCoverageReport(p.date as Date),
  },
  {
    id: "source-conflicts",
    title: "דוח סתירות בנתוני המקור",
    sheetName: "סתירות מקור",
    parseParams: () => ({}),
    run: () => sourceConflictsReport(),
  },
  {
    id: "pending-verification",
    title: "דוח נתונים הממתינים לאימות",
    sheetName: "ממתין לאימות",
    parseParams: () => ({}),
    run: () => pendingVerificationReport(),
  },
];

export function getReport(id: string): ReportEntry | undefined {
  return REPORTS.find((r) => r.id === id);
}
