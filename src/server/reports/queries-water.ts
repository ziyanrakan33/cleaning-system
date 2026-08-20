/**
 * Water/routing reports (§16), added alongside the existing execution and
 * quality report families. Every figure here traces back to either the
 * *planned* route (`WorkPlanTask.plannedWaterLiters`, `WorkPlanServiceStop`,
 * written by the optimisation engine) or *measured* execution
 * (`TaskFieldReport`) — never a synthesised number — and each report says
 * plainly which of the two it is drawing from.
 */
import { prisma } from "@/lib/prisma";
import type { ReportColumn } from "./export";
import type { ReportResult } from "./queries-execution";
import { dateRange } from "./shared";

const litersFmt = (l: number) => Math.round(l * 10) / 10;

// ---------------------------------------------------------------------------
// Water consumption by vehicle / zone / infrastructure type — planned
// ---------------------------------------------------------------------------

export async function waterConsumptionReport(
  from: Date,
  to: Date,
  groupBy: "resource" | "zone" | "infrastructure"
): Promise<ReportResult> {
  const days = dateRange(from, to);
  const plans = await prisma.workPlan.findMany({
    where: { date: { in: days } },
    orderBy: [{ date: "asc" }, { versionNumber: "desc" }],
    include: {
      tasks: {
        where: { plannedWaterLiters: { not: null } },
        include: {
          resource: { select: { identifier: true, resourceType: { select: { name: true } } } },
          street: {
            select: { type: true, cleaningProfile: { select: { infrastructureKind: true } }, zone: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  // Keep only the latest version per date.
  const latestByDate = new Map<string, (typeof plans)[number]>();
  for (const p of plans) {
    const key = p.date.toISOString().slice(0, 10);
    const existing = latestByDate.get(key);
    if (!existing || p.versionNumber > existing.versionNumber) latestByDate.set(key, p);
  }

  const byGroup = new Map<string, { header: string; liters: number; segments: number; measured: number }>();
  for (const plan of latestByDate.values()) {
    for (const t of plan.tasks) {
      const key =
        groupBy === "resource"
          ? `${t.resource.resourceType.name} ${t.resource.identifier}`
          : groupBy === "zone"
          ? t.street.zone?.name ?? "ללא אזור"
          : t.street.cleaningProfile?.infrastructureKind ?? t.street.type;
      const entry = byGroup.get(key) ?? { header: key, liters: 0, segments: 0, measured: 0 };
      entry.liters += t.plannedWaterLiters ?? 0;
      entry.segments++;
      if (t.waterBasis === "MEASURED") entry.measured++;
      byGroup.set(key, entry);
    }
  }

  const columns: ReportColumn[] = [
    { key: "group", header: groupBy === "resource" ? "כלי" : groupBy === "zone" ? "אזור" : "סוג תשתית" },
    { key: "liters", header: "ליטרים (מתוכנן)" },
    { key: "segments", header: "מקטעים" },
    { key: "measuredPercent", header: "אחוז מבוסס-מדידה" },
  ];
  const rows = [...byGroup.values()]
    .sort((a, b) => b.liters - a.liters)
    .map((g) => ({
      group: g.header,
      liters: litersFmt(g.liters),
      segments: g.segments,
      measuredPercent: g.segments > 0 ? Math.round((g.measured / g.segments) * 100) : 0,
    }));

  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Refill / disposal stops: count, time, and which points have the longest wait
// ---------------------------------------------------------------------------

export async function serviceStopsReport(from: Date, to: Date): Promise<ReportResult> {
  const days = dateRange(from, to);
  const stops = await prisma.workPlanServiceStop.findMany({
    where: { workPlan: { date: { in: days } } },
    include: {
      waterRefillPoint: { select: { name: true } },
      wasteDisposalPoint: { select: { name: true } },
      workPlan: { select: { date: true, versionNumber: true } },
    },
  });

  // Keep only stops belonging to the latest plan version per date.
  const latestVersionByDate = new Map<string, number>();
  for (const s of stops) {
    const key = s.workPlan.date.toISOString().slice(0, 10);
    latestVersionByDate.set(key, Math.max(latestVersionByDate.get(key) ?? 0, s.workPlan.versionNumber));
  }

  type Agg = { name: string; kind: string; visits: number; totalServiceMin: number; totalTravelMin: number };
  const byPoint = new Map<string, Agg>();
  for (const s of stops) {
    const key = s.workPlan.date.toISOString().slice(0, 10);
    if (s.workPlan.versionNumber !== latestVersionByDate.get(key)) continue;

    const name = s.waterRefillPoint?.name ?? s.wasteDisposalPoint?.name ?? "—";
    const entry = byPoint.get(name) ?? {
      name,
      kind: s.kind === "WATER_REFILL" ? "מילוי מים" : s.kind === "WASTE_DISPOSAL" ? "פריקת פסולת" : "הפסקה",
      visits: 0,
      totalServiceMin: 0,
      totalTravelMin: 0,
    };
    entry.visits++;
    entry.totalServiceMin += s.serviceTimeMin ?? 0;
    entry.totalTravelMin += s.travelTimeMin ?? 0;
    byPoint.set(name, entry);
  }

  const columns: ReportColumn[] = [
    { key: "name", header: "נקודה" },
    { key: "kind", header: "סוג" },
    { key: "visits", header: "ביקורים" },
    { key: "avgServiceMin", header: "זמן שירות ממוצע (דק׳)" },
    { key: "avgTravelMin", header: "זמן נסיעה ממוצע (דק׳)" },
  ];
  const rows = [...byPoint.values()]
    .sort((a, b) => b.visits - a.visits)
    .map((p) => ({
      name: p.name,
      kind: p.kind,
      visits: p.visits,
      avgServiceMin: p.visits > 0 ? Math.round((p.totalServiceMin / p.visits) * 10) / 10 : 0,
      avgTravelMin: p.visits > 0 ? Math.round((p.totalTravelMin / p.visits) * 10) / 10 : 0,
    }));

  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Plan vs. actual clean-time accuracy — measured only
// ---------------------------------------------------------------------------

export async function forecastAccuracyReport(from: Date, to: Date): Promise<ReportResult> {
  const days = dateRange(from, to);
  const reports = await prisma.taskFieldReport.findMany({
    where: { workPlanTask: { workPlan: { date: { in: days } } }, startedAt: { not: null }, endedAt: { not: null } },
    include: {
      workPlanTask: {
        select: {
          cleanTimeMin: true,
          street: { select: { name: true } },
          workPlan: { select: { date: true } },
        },
      },
    },
  });

  const columns: ReportColumn[] = [
    { key: "date", header: "תאריך" },
    { key: "street", header: "רחוב" },
    { key: "plannedMin", header: "זמן מתוכנן (דק׳)" },
    { key: "actualMin", header: "זמן בפועל (דק׳)" },
    { key: "deviationPercent", header: "סטייה באחוזים" },
  ];

  const rows = reports
    .filter((r) => r.workPlanTask.cleanTimeMin)
    .map((r) => {
      const actualMin = (r.endedAt!.getTime() - r.startedAt!.getTime()) / 60000;
      const plannedMin = r.workPlanTask.cleanTimeMin!;
      return {
        date: r.workPlanTask.workPlan.date.toISOString().slice(0, 10),
        street: r.workPlanTask.street.name,
        plannedMin: Math.round(plannedMin),
        actualMin: Math.round(actualMin),
        deviationPercent: plannedMin > 0 ? Math.round(((actualMin - plannedMin) / plannedMin) * 100) : null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return { columns, rows };
}
