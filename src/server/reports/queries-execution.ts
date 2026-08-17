import { prisma } from "@/lib/prisma";
import type { ReportColumn } from "./export";
import {
  DONE_LIKE,
  NOT_DONE_LIKE,
  PRIORITY_LABEL,
  SHIFT_TYPE_LABEL,
  STREET_TYPE_LABEL,
  TASK_STATUS_LABEL,
  getPlanTaskRowsForRange,
} from "./shared";

export type ReportResult = { columns: ReportColumn[]; rows: Record<string, string | number | null>[] };

const hhmm = (d: Date) => d.toTimeString().slice(0, 5);
const km = (m: number) => Math.round((m / 1000) * 10) / 10;

// ---------------------------------------------------------------------------
// 1. Weekly report by zone
// ---------------------------------------------------------------------------
export async function weeklyZoneReport(from: Date, to: Date): Promise<ReportResult> {
  const [tasks, zones] = await Promise.all([
    getPlanTaskRowsForRange(from, to),
    prisma.operationalZone.findMany({ where: { active: true }, orderBy: { zoneNumber: "asc" }, select: { id: true, name: true, code: true } }),
  ]);

  type Agg = { name: string; code: string; planned: number; done: number; notDone: number; pending: number; plannedM: number; doneM: number };
  const byZone = new Map<string, Agg>();
  const get = (id: string, name: string, code: string) => {
    let a = byZone.get(id);
    if (!a) { a = { name, code, planned: 0, done: 0, notDone: 0, pending: 0, plannedM: 0, doneM: 0 }; byZone.set(id, a); }
    return a;
  };
  for (const z of zones) get(z.id, z.name, z.code);

  for (const t of tasks) {
    const a = t.zoneId ? get(t.zoneId, t.zoneName ?? t.zoneId, "") : get("__none__", "ללא אזור", "—");
    a.planned++;
    a.plannedM += t.distanceM ?? 0;
    if ((DONE_LIKE as readonly string[]).includes(t.status)) { a.done++; a.doneM += t.distanceM ?? 0; }
    else if ((NOT_DONE_LIKE as readonly string[]).includes(t.status)) a.notDone++;
    else a.pending++;
  }

  const rows = [...byZone.values()]
    .filter((a) => a.planned > 0 || a.code !== "—")
    .map((a) => ({
      zone: a.name,
      code: a.code,
      planned: a.planned,
      done: a.done,
      notDone: a.notDone,
      pending: a.pending,
      completionPercent: a.planned > 0 ? Math.round((a.done / a.planned) * 100) : null,
      kmPlanned: km(a.plannedM),
      kmDone: km(a.doneM),
    }));

  return {
    columns: [
      { header: "אזור", key: "zone", width: 20 },
      { header: "קוד", key: "code", width: 8 },
      { header: "משימות מתוכננות", key: "planned", width: 14 },
      { header: "בוצעו", key: "done", width: 10 },
      { header: "לא בוצעו", key: "notDone", width: 10 },
      { header: "ממתינות", key: "pending", width: 10 },
      { header: "אחוז ביצוע", key: "completionPercent", width: 10 },
      { header: 'ק"מ מתוכנן', key: "kmPlanned", width: 12 },
      { header: 'ק"מ בוצע', key: "kmDone", width: 12 },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// 2. Monthly report by contractor
// ---------------------------------------------------------------------------
export async function monthlyContractorReport(from: Date, to: Date, showMoney: boolean): Promise<ReportResult> {
  const [tasks, areas, defects] = await Promise.all([
    getPlanTaskRowsForRange(from, to),
    prisma.contractArea.findMany({ include: { contractor: { select: { name: true } } }, orderBy: { areaNumber: "asc" } }),
    prisma.defect.findMany({
      where: { OR: [{ reportedAt: { gte: from, lte: to } }, { closedAt: { gte: from, lte: to } }] },
      select: { contractAreaId: true, reportedAt: true, closedAt: true, deductionStatus: true, deductionAmount: true, deductionSurchargePercent: true },
    }),
  ]);

  type Agg = {
    name: string; contractor: string; planned: number; done: number; notDone: number;
    plannedM: number; doneM: number; resources: Set<string>; defectsOpened: number; defectsClosed: number; deductionSum: number;
  };
  const byArea = new Map<string, Agg>();
  const get = (id: string, name: string, contractor: string) => {
    let a = byArea.get(id);
    if (!a) { a = { name, contractor, planned: 0, done: 0, notDone: 0, plannedM: 0, doneM: 0, resources: new Set(), defectsOpened: 0, defectsClosed: 0, deductionSum: 0 }; byArea.set(id, a); }
    return a;
  };
  for (const ar of areas) get(ar.id, ar.name, ar.contractor?.name ?? "ללא קבלן");

  for (const t of tasks) {
    const key = t.contractAreaId ?? "__none__";
    const a = t.contractAreaId ? get(key, "", "") : get(key, "ללא שיוך לקבלן", "—");
    a.planned++;
    a.plannedM += t.distanceM ?? 0;
    a.resources.add(t.resourceId);
    if ((DONE_LIKE as readonly string[]).includes(t.status)) { a.done++; a.doneM += t.distanceM ?? 0; }
    else if ((NOT_DONE_LIKE as readonly string[]).includes(t.status)) a.notDone++;
  }

  for (const d of defects) {
    const key = d.contractAreaId ?? "__none__";
    const a = d.contractAreaId ? byArea.get(key) : get(key, "ללא שיוך לקבלן", "—");
    if (!a) continue;
    if (d.reportedAt >= from && d.reportedAt <= to) a.defectsOpened++;
    if (d.closedAt && d.closedAt >= from && d.closedAt <= to) a.defectsClosed++;
    if (d.deductionStatus === "APPROVED" || d.deductionStatus === "APPLIED") {
      const base = Number(d.deductionAmount ?? 0);
      const pct = d.deductionSurchargePercent ?? 0;
      a.deductionSum += Math.round(base * (1 + pct / 100) * 100) / 100;
    }
  }

  const rows = [...byArea.values()].map((a) => ({
    contractArea: a.name,
    contractor: a.contractor,
    tasksPlanned: a.planned,
    tasksDone: a.done,
    tasksNotDone: a.notDone,
    completionPercent: a.planned > 0 ? Math.round((a.done / a.planned) * 100) : null,
    kmPlanned: km(a.plannedM),
    kmDone: km(a.doneM),
    resourcesDeployed: a.resources.size,
    defectsOpened: a.defectsOpened,
    defectsClosed: a.defectsClosed,
    ...(showMoney ? { deductionsApproved: a.deductionSum } : {}),
  }));

  const columns: ReportColumn[] = [
    { header: "אזור מכרז", key: "contractArea", width: 18 },
    { header: "קבלן", key: "contractor", width: 22 },
    { header: "משימות מתוכננות", key: "tasksPlanned", width: 14 },
    { header: "בוצעו", key: "tasksDone", width: 10 },
    { header: "לא בוצעו", key: "tasksNotDone", width: 10 },
    { header: "אחוז ביצוע", key: "completionPercent", width: 10 },
    { header: 'ק"מ מתוכנן', key: "kmPlanned", width: 12 },
    { header: 'ק"מ בוצע', key: "kmDone", width: 12 },
    { header: "משאבים שהופעלו", key: "resourcesDeployed", width: 14 },
    { header: "ליקויים שנפתחו", key: "defectsOpened", width: 12 },
    { header: "ליקויים שנסגרו", key: "defectsClosed", width: 12 },
  ];
  if (showMoney) columns.push({ header: "קיזוזים מאושרים (₪)", key: "deductionsApproved", width: 16 });

  return { columns, rows };
}

// ---------------------------------------------------------------------------
// 3. Report by resource (vehicle / license number)
// ---------------------------------------------------------------------------
export async function byResourceReport(resourceId: string, from: Date, to: Date): Promise<ReportResult> {
  const tasks = (await getPlanTaskRowsForRange(from, to)).filter((t) => t.resourceId === resourceId);
  const rows = tasks.map((t) => ({
    date: t.date,
    street: t.streetName,
    type: STREET_TYPE_LABEL[t.streetType] ?? t.streetType,
    zone: t.zoneName ?? "ללא אזור",
    plannedStart: hhmm(t.plannedStart),
    plannedEnd: hhmm(t.plannedEnd),
    actualStart: t.actualStart ? hhmm(t.actualStart) : "—",
    actualEnd: t.actualEnd ? hhmm(t.actualEnd) : "—",
    distanceM: t.distanceM ? Math.round(t.distanceM) : 0,
    status: TASK_STATUS_LABEL[t.status] ?? t.status,
  }));

  return {
    columns: [
      { header: "תאריך", key: "date", width: 12 },
      { header: "רחוב", key: "street", width: 22 },
      { header: "סוג", key: "type", width: 10 },
      { header: "אזור", key: "zone", width: 16 },
      { header: "התחלה מתוכננת", key: "plannedStart", width: 12 },
      { header: "סיום מתוכנן", key: "plannedEnd", width: 12 },
      { header: "התחלה בפועל", key: "actualStart", width: 12 },
      { header: "סיום בפועל", key: "actualEnd", width: 12 },
      { header: "מרחק (מ')", key: "distanceM", width: 10 },
      { header: "סטטוס", key: "status", width: 10 },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// 4. Report by worker / site supervisor (via the resource they're assigned to)
// ---------------------------------------------------------------------------
export async function byWorkerReport(userId: string, from: Date, to: Date): Promise<ReportResult> {
  const resources = await prisma.resource.findMany({ where: { assignedEmployeeId: userId }, select: { id: true } });
  const resourceIds = new Set(resources.map((r) => r.id));
  const tasks = (await getPlanTaskRowsForRange(from, to)).filter((t) => resourceIds.has(t.resourceId));

  const rows = tasks.map((t) => ({
    date: t.date,
    resource: `${t.resourceTypeName} ${t.resourceIdentifier}`,
    street: t.streetName,
    zone: t.zoneName ?? "ללא אזור",
    plannedStart: hhmm(t.plannedStart),
    plannedEnd: hhmm(t.plannedEnd),
    status: TASK_STATUS_LABEL[t.status] ?? t.status,
  }));

  return {
    columns: [
      { header: "תאריך", key: "date", width: 12 },
      { header: "כלי", key: "resource", width: 20 },
      { header: "רחוב", key: "street", width: 22 },
      { header: "אזור", key: "zone", width: 16 },
      { header: "התחלה", key: "plannedStart", width: 10 },
      { header: "סיום", key: "plannedEnd", width: 10 },
      { header: "סטטוס", key: "status", width: 10 },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// 5. Shift report (morning / afternoon / night / rest day) — one parameterized
//    report standing in for the tender's four separate shift reports.
// ---------------------------------------------------------------------------
export async function shiftReport(shiftType: string, date: Date): Promise<ReportResult> {
  const [resources, tasks] = await Promise.all([
    prisma.resource.findMany({ where: { resourceType: { shiftType: shiftType as never } }, select: { id: true } }),
    getPlanTaskRowsForRange(date, date),
  ]);
  const ids = new Set(resources.map((r) => r.id));
  const rows = tasks
    .filter((t) => ids.has(t.resourceId))
    .map((t) => ({
      resource: `${t.resourceTypeName} ${t.resourceIdentifier}`,
      street: t.streetName,
      zone: t.zoneName ?? "ללא אזור",
      plannedStart: hhmm(t.plannedStart),
      plannedEnd: hhmm(t.plannedEnd),
      status: TASK_STATUS_LABEL[t.status] ?? t.status,
    }));

  return {
    columns: [
      { header: "כלי", key: "resource", width: 20 },
      { header: "רחוב", key: "street", width: 22 },
      { header: "אזור", key: "zone", width: 16 },
      { header: "התחלה", key: "plannedStart", width: 10 },
      { header: "סיום", key: "plannedEnd", width: 10 },
      { header: "סטטוס", key: "status", width: 10 },
    ],
    rows,
  };
}
export { SHIFT_TYPE_LABEL };

// ---------------------------------------------------------------------------
// 6. Vehicles that worked in each zone, for a given day
// ---------------------------------------------------------------------------
export async function zoneVehiclesReport(date: Date): Promise<ReportResult> {
  const tasks = await getPlanTaskRowsForRange(date, date);
  type Key = string;
  const byPair = new Map<Key, { zone: string; resource: string; count: number; priorityMax: string | null }>();
  for (const t of tasks) {
    const zoneName = t.zoneName ?? "ללא אזור";
    const key = `${zoneName}::${t.resourceId}`;
    const existing = byPair.get(key);
    if (existing) existing.count++;
    else byPair.set(key, { zone: zoneName, resource: `${t.resourceTypeName} ${t.resourceIdentifier}`, count: 1, priorityMax: null });
  }
  const rows = [...byPair.values()]
    .sort((a, b) => a.zone.localeCompare(b.zone, "he"))
    .map((r) => ({ zone: r.zone, resource: r.resource, tasks: r.count }));

  return {
    columns: [
      { header: "אזור", key: "zone", width: 18 },
      { header: "כלי", key: "resource", width: 22 },
      { header: "מספר משימות", key: "tasks", width: 12 },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// 7. Planned vs actual work hours, per resource
// ---------------------------------------------------------------------------
export async function hoursPlannedVsActualReport(from: Date, to: Date): Promise<ReportResult> {
  const tasks = await getPlanTaskRowsForRange(from, to);
  type Agg = { resource: string; taskCount: number; plannedMin: number; actualMin: number; withActual: number };
  const byResource = new Map<string, Agg>();
  for (const t of tasks) {
    const key = t.resourceId;
    let a = byResource.get(key);
    if (!a) { a = { resource: `${t.resourceTypeName} ${t.resourceIdentifier}`, taskCount: 0, plannedMin: 0, actualMin: 0, withActual: 0 }; byResource.set(key, a); }
    a.taskCount++;
    a.plannedMin += (t.cleanTimeMin ?? 0) + (t.travelTimeMin ?? 0);
    if (t.actualStart && t.actualEnd) {
      a.actualMin += Math.max(0, (t.actualEnd.getTime() - t.actualStart.getTime()) / 60000);
      a.withActual++;
    }
  }
  const rows = [...byResource.values()].map((a) => ({
    resource: a.resource,
    tasks: a.taskCount,
    plannedHours: Math.round((a.plannedMin / 60) * 10) / 10,
    actualHours: a.withActual > 0 ? Math.round((a.actualMin / 60) * 10) / 10 : null,
    tasksWithActualData: a.withActual,
    varianceHours: a.withActual > 0 ? Math.round(((a.actualMin - a.plannedMin) / 60) * 10) / 10 : null,
  }));

  return {
    columns: [
      { header: "כלי", key: "resource", width: 22 },
      { header: "משימות", key: "tasks", width: 10 },
      { header: "שעות מתוכננות", key: "plannedHours", width: 14 },
      { header: "שעות בפועל", key: "actualHours", width: 12 },
      { header: "משימות עם דיווח בפועל", key: "tasksWithActualData", width: 16 },
      { header: "פער (שעות)", key: "varianceHours", width: 12 },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// 8. Streets completed / not completed
// ---------------------------------------------------------------------------
export async function streetsCompletionReport(
  from: Date,
  to: Date,
  zoneId: string | null,
  resultFilter: "all" | "done" | "not-done"
): Promise<ReportResult> {
  const tasks = (await getPlanTaskRowsForRange(from, to)).filter((t) => !zoneId || t.zoneId === zoneId);

  type Agg = { street: string; type: string; zone: string; done: number; notDone: number; pending: number; lastDate: string; lastStatus: string };
  const byStreet = new Map<string, Agg>();
  for (const t of tasks) {
    let a = byStreet.get(t.streetId);
    if (!a) {
      a = { street: t.streetName, type: STREET_TYPE_LABEL[t.streetType] ?? t.streetType, zone: t.zoneName ?? "ללא אזור", done: 0, notDone: 0, pending: 0, lastDate: t.date, lastStatus: t.status };
      byStreet.set(t.streetId, a);
    }
    if ((DONE_LIKE as readonly string[]).includes(t.status)) a.done++;
    else if ((NOT_DONE_LIKE as readonly string[]).includes(t.status)) a.notDone++;
    else a.pending++;
    if (t.date >= a.lastDate) { a.lastDate = t.date; a.lastStatus = t.status; }
  }

  let rows = [...byStreet.values()];
  if (resultFilter === "done") rows = rows.filter((a) => (DONE_LIKE as readonly string[]).includes(a.lastStatus));
  if (resultFilter === "not-done") rows = rows.filter((a) => !(DONE_LIKE as readonly string[]).includes(a.lastStatus));

  return {
    columns: [
      { header: "רחוב", key: "street", width: 22 },
      { header: "סוג", key: "type", width: 10 },
      { header: "אזור", key: "zone", width: 16 },
      { header: "בוצע", key: "done", width: 8 },
      { header: "לא בוצע", key: "notDone", width: 8 },
      { header: "ממתין", key: "pending", width: 8 },
      { header: "תאריך אחרון", key: "lastDate", width: 12 },
      { header: "סטטוס אחרון", key: "lastStatus", width: 12 },
    ],
    rows: rows.map((a) => ({ ...a, lastStatus: TASK_STATUS_LABEL[a.lastStatus] ?? a.lastStatus })),
  };
}

// ---------------------------------------------------------------------------
// 9. Kilometres planned vs actually cleaned
// ---------------------------------------------------------------------------
export async function kmPlannedVsActualReport(from: Date, to: Date, groupBy: "zone" | "contractor"): Promise<ReportResult> {
  const tasks = await getPlanTaskRowsForRange(from, to);
  const [zones, areas] = await Promise.all([
    prisma.operationalZone.findMany({ where: { active: true }, select: { id: true, name: true, contractAreaId: true } }),
    prisma.contractArea.findMany({ include: { contractor: { select: { name: true } } } }),
  ]);
  const zoneToArea = new Map(zones.map((z) => [z.id, z.contractAreaId]));
  const areaLabel = new Map(areas.map((a) => [a.id, `${a.name} — ${a.contractor?.name ?? "ללא קבלן"}`]));

  const byGroup = new Map<string, { label: string; plannedM: number; doneM: number }>();
  for (const t of tasks) {
    const key = groupBy === "zone" ? (t.zoneId ?? "__none__") : (t.contractAreaId ?? zoneToArea.get(t.zoneId ?? "") ?? "__none__");
    const label = groupBy === "zone" ? (t.zoneName ?? "ללא אזור") : (areaLabel.get(key) ?? "ללא שיוך לקבלן");
    let a = byGroup.get(key);
    if (!a) { a = { label, plannedM: 0, doneM: 0 }; byGroup.set(key, a); }
    a.plannedM += t.distanceM ?? 0;
    if ((DONE_LIKE as readonly string[]).includes(t.status)) a.doneM += t.distanceM ?? 0;
  }

  const rows = [...byGroup.values()]
    .sort((a, b) => a.label.localeCompare(b.label, "he"))
    .map((a) => ({
      group: a.label,
      kmPlanned: km(a.plannedM),
      kmDone: km(a.doneM),
      kmGap: km(a.plannedM - a.doneM),
      completionPercent: a.plannedM > 0 ? Math.round((a.doneM / a.plannedM) * 100) : null,
    }));

  return {
    columns: [
      { header: groupBy === "zone" ? "אזור" : "אזור מכרז / קבלן", key: "group", width: 24 },
      { header: 'ק"מ מתוכנן', key: "kmPlanned", width: 12 },
      { header: 'ק"מ בוצע', key: "kmDone", width: 12 },
      { header: 'פער ק"מ', key: "kmGap", width: 12 },
      { header: "אחוז ביצוע", key: "completionPercent", width: 10 },
    ],
    rows,
  };
}

export { PRIORITY_LABEL };
