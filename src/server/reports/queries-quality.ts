import { prisma } from "@/lib/prisma";
import type { ReportColumn } from "./export";
import type { ReportResult } from "./queries-execution";
import { getPlanTaskRowsForRange, formatFrequency, maxDaysAllowed } from "./shared";

const DEFECT_STATUS_LABEL: Record<string, string> = {
  NEW: "חדש", ASSIGNED: "הועבר לטיפול", IN_PROGRESS: "בטיפול", AWAITING_PROOF: "ממתין להוכחה",
  FIXED: "תוקן", REJECTED: "נדחה", APPEALED: "בערעור", CLOSED: "נסגר",
};
const SEVERITY_LABEL: Record<string, string> = { LOW: "נמוכה", MEDIUM: "בינונית", HIGH: "גבוהה", CRITICAL: "קריטית" };

function effectiveDeduction(amount: unknown, surchargePercent: number | null, status: string): number {
  if (status !== "APPROVED" && status !== "APPLIED") return 0;
  const base = Number(amount ?? 0);
  return Math.round(base * (1 + (surchargePercent ?? 0) / 100) * 100) / 100;
}

// ---------------------------------------------------------------------------
// 10. Defects — open and closed
// ---------------------------------------------------------------------------
export async function defectsReport(opts: {
  from: Date;
  to: Date;
  zoneId?: string | null;
  contractAreaId?: string | null;
  status?: string | null;
  showMoney: boolean;
}): Promise<ReportResult> {
  const defects = await prisma.defect.findMany({
    where: {
      OR: [{ reportedAt: { gte: opts.from, lte: opts.to } }, { closedAt: { gte: opts.from, lte: opts.to } }],
      ...(opts.zoneId ? { zoneId: opts.zoneId } : {}),
      ...(opts.contractAreaId ? { contractAreaId: opts.contractAreaId } : {}),
      ...(opts.status && opts.status !== "ALL" ? { status: opts.status as never } : {}),
    },
    orderBy: { reportedAt: "desc" },
    include: {
      zone: { select: { name: true } },
      contractArea: { select: { name: true, contractor: { select: { name: true } } } },
      defectType: { select: { name: true } },
    },
  });

  const rows = defects.map((d) => ({
    reference: d.reference,
    title: d.title,
    type: d.defectType?.name ?? "—",
    zone: d.zone?.name ?? "ללא אזור",
    contractor: d.contractArea?.contractor?.name ?? "—",
    severity: SEVERITY_LABEL[d.severity] ?? d.severity,
    status: DEFECT_STATUS_LABEL[d.status] ?? d.status,
    reportedAt: d.reportedAt.toISOString().slice(0, 10),
    dueAt: d.dueAt ? d.dueAt.toISOString().slice(0, 10) : "—",
    fixedAt: d.fixedAt ? d.fixedAt.toISOString().slice(0, 10) : "—",
    closedAt: d.closedAt ? d.closedAt.toISOString().slice(0, 10) : "—",
    ...(opts.showMoney
      ? {
          deductionStatus: d.deductionStatus,
          deductionAmount: effectiveDeduction(d.deductionAmount, d.deductionSurchargePercent, d.deductionStatus),
        }
      : {}),
  }));

  const columns: ReportColumn[] = [
    { header: "מס' אסמכתא", key: "reference", width: 14 },
    { header: "כותרת", key: "title", width: 26 },
    { header: "סוג ליקוי", key: "type", width: 20 },
    { header: "אזור", key: "zone", width: 16 },
    { header: "קבלן", key: "contractor", width: 20 },
    { header: "חומרה", key: "severity", width: 10 },
    { header: "סטטוס", key: "status", width: 12 },
    { header: "דווח", key: "reportedAt", width: 12 },
    { header: "מועד יעד", key: "dueAt", width: 12 },
    { header: "תוקן", key: "fixedAt", width: 12 },
    { header: "נסגר", key: "closedAt", width: 12 },
  ];
  if (opts.showMoney) {
    columns.push({ header: "סטטוס קיזוז", key: "deductionStatus", width: 12 });
    columns.push({ header: "קיזוז (₪)", key: "deductionAmount", width: 12 });
  }

  return { columns, rows };
}

// ---------------------------------------------------------------------------
// 11. Quality control — inspections vs defects found, by zone
// ---------------------------------------------------------------------------
export async function qualityControlReport(from: Date, to: Date): Promise<ReportResult> {
  const [zones, inspections, defects] = await Promise.all([
    prisma.operationalZone.findMany({ where: { active: true }, orderBy: { zoneNumber: "asc" }, select: { id: true, name: true } }),
    prisma.inspection.findMany({ where: { date: { gte: from, lte: to } }, select: { zoneId: true, status: true } }),
    prisma.defect.findMany({
      where: { reportedAt: { gte: from, lte: to } },
      select: { zoneId: true, origin: true, reportedAt: true, fixedAt: true },
    }),
  ]);

  type Agg = { zone: string; planned: number; completed: number; defectsFound: number; totalFixDays: number; fixedCount: number };
  const byZone = new Map<string, Agg>();
  const get = (id: string, name: string) => {
    let a = byZone.get(id);
    if (!a) { a = { zone: name, planned: 0, completed: 0, defectsFound: 0, totalFixDays: 0, fixedCount: 0 }; byZone.set(id, a); }
    return a;
  };
  for (const z of zones) get(z.id, z.name);

  for (const i of inspections) {
    const a = i.zoneId ? get(i.zoneId, "") : get("__none__", "כלל האזורים");
    a.planned++;
    if (i.status === "COMPLETED") a.completed++;
  }
  for (const d of defects) {
    const a = d.zoneId ? get(d.zoneId, "") : get("__none__", "ללא אזור");
    if (d.origin === "INSPECTION") a.defectsFound++;
    if (d.fixedAt) {
      a.totalFixDays += (d.fixedAt.getTime() - d.reportedAt.getTime()) / 86_400_000;
      a.fixedCount++;
    }
  }

  const rows = [...byZone.values()]
    .filter((a) => a.zone)
    .map((a) => ({
      zone: a.zone,
      inspectionsPlanned: a.planned,
      inspectionsCompleted: a.completed,
      defectsFoundInInspection: a.defectsFound,
      avgDaysToFix: a.fixedCount > 0 ? Math.round((a.totalFixDays / a.fixedCount) * 10) / 10 : null,
    }));

  return {
    columns: [
      { header: "אזור", key: "zone", width: 18 },
      { header: "סיורים מתוכננים", key: "inspectionsPlanned", width: 14 },
      { header: "סיורים שהושלמו", key: "inspectionsCompleted", width: 14 },
      { header: "ליקויים שהתגלו בסיור", key: "defectsFoundInInspection", width: 18 },
      { header: "ממוצע ימים לתיקון", key: "avgDaysToFix", width: 16 },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// 12. Resource utilization vs the contract (also surfaces over-quota use)
// ---------------------------------------------------------------------------
export async function resourceUtilizationReport(from: Date, to: Date, contractAreaId: string | null): Promise<ReportResult> {
  const [quotas, tasks, zones] = await Promise.all([
    prisma.contractAreaResourceQuota.findMany({
      where: contractAreaId ? { contractAreaId } : {},
      include: { resourceType: { select: { name: true } }, contractArea: { select: { name: true, contractor: { select: { name: true } } } } },
      orderBy: [{ contractAreaId: "asc" }, { lineNumber: "asc" }],
    }),
    getPlanTaskRowsForRange(from, to),
    prisma.operationalZone.findMany({ select: { id: true, contractAreaId: true } }),
  ]);
  const zoneToArea = new Map(zones.map((z) => [z.id, z.contractAreaId]));

  // Distinct resources of each type actually deployed per day, per contract area.
  const perDayByAreaType = new Map<string, Map<string, Set<string>>>(); // "area::type" -> date -> resourceIds
  for (const t of tasks) {
    const area = t.contractAreaId ?? zoneToArea.get(t.zoneId ?? "") ?? null;
    if (!area) continue;
    const key = `${area}::${t.resourceTypeName}`;
    let byDate = perDayByAreaType.get(key);
    if (!byDate) { byDate = new Map(); perDayByAreaType.set(key, byDate); }
    let set = byDate.get(t.date);
    if (!set) { set = new Set(); byDate.set(t.date, set); }
    set.add(t.resourceId);
  }

  const rows = quotas.map((q) => {
    const key = `${q.contractAreaId}::${q.resourceType.name}`;
    const byDate = perDayByAreaType.get(key);
    const days = byDate ? [...byDate.values()] : [];
    const avgActual = days.length > 0 ? days.reduce((s, set) => s + set.size, 0) / days.length : 0;
    const avgRounded = Math.round(avgActual * 10) / 10;
    return {
      contractArea: q.contractArea.name,
      contractor: q.contractArea.contractor?.name ?? "—",
      resourceType: q.resourceType.name,
      contractedQuantity: q.quantity,
      avgActualDeployed: avgRounded,
      variance: Math.round((avgActual - q.quantity) * 10) / 10,
      overQuota: avgActual > q.quantity,
    };
  });

  return {
    columns: [
      { header: "אזור מכרז", key: "contractArea", width: 16 },
      { header: "קבלן", key: "contractor", width: 20 },
      { header: "סוג משאב", key: "resourceType", width: 26 },
      { header: "כמות חוזית", key: "contractedQuantity", width: 12 },
      { header: "ממוצע בפועל ליום", key: "avgActualDeployed", width: 16 },
      { header: "פער", key: "variance", width: 10 },
      { header: "חריגה מעל ההסכם", key: "overQuota", width: 14 },
    ],
    rows: rows.map((r) => ({ ...r, overQuota: r.overQuota ? "כן" : "לא" })),
  };
}

// ---------------------------------------------------------------------------
// 13. Citywide coverage
// ---------------------------------------------------------------------------
export async function cityCoverageReport(asOf: Date): Promise<ReportResult> {
  const [streets, lastCleanedRows] = await Promise.all([
    prisma.street.findMany({
      where: { active: true },
      select: { id: true, name: true, type: true, cleaningFrequency: true, zone: { select: { name: true } } },
    }),
    prisma.streetCleaningLog.groupBy({ by: ["streetId"], where: { completed: true, date: { lte: asOf } }, _max: { date: true } }),
  ]);
  const lastCleanedMap = new Map(lastCleanedRows.map((r) => [r.streetId, r._max.date]));

  let neverCleaned = 0;
  let withinWindow = 0;
  let overdue = 0;

  const rows = streets.map((s) => {
    const last = lastCleanedMap.get(s.id) ?? null;
    const daysSince = last ? Math.floor((asOf.getTime() - last.getTime()) / 86_400_000) : null;
    const allowed = maxDaysAllowed(s.cleaningFrequency);
    let coverageStatus: string;
    if (!last) { coverageStatus = "מעולם לא נוקה"; neverCleaned++; }
    else if (allowed === null) { coverageStatus = "לפי צורך / ימים קבועים"; }
    else if (daysSince! <= allowed) { coverageStatus = "בזמן"; withinWindow++; }
    else { coverageStatus = "באיחור"; overdue++; }

    return {
      street: s.name,
      zone: s.zone?.name ?? "ללא אזור",
      frequency: formatFrequency(s.cleaningFrequency),
      lastCleaned: last ? last.toISOString().slice(0, 10) : "—",
      daysSince: daysSince ?? "—",
      coverageStatus,
    };
  });

  const summaryRow = {
    street: `סה"כ ${streets.length} רחובות ושבילים`,
    zone: "",
    frequency: "",
    lastCleaned: "",
    daysSince: "",
    coverageStatus: `${withinWindow} בזמן · ${overdue} באיחור · ${neverCleaned} מעולם לא נוקו`,
  };

  return {
    columns: [
      { header: "רחוב / שביל", key: "street", width: 24 },
      { header: "אזור", key: "zone", width: 16 },
      { header: "תדירות", key: "frequency", width: 18 },
      { header: "נוקה לאחרונה", key: "lastCleaned", width: 14 },
      { header: "ימים מאז", key: "daysSince", width: 10 },
      { header: "סטטוס כיסוי", key: "coverageStatus", width: 20 },
    ],
    rows: [summaryRow, ...rows],
  };
}
