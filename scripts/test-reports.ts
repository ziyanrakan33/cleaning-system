/**
 * Exercises the report queries against known, hand-computed data: two zones
 * under two different contract areas, one completed task and one incomplete
 * task, a resource quota, and a cleaning log — then checks that every
 * aggregate (completion %, km planned/done, hours variance, quota variance,
 * coverage status) comes out to the number that arithmetic says it should.
 *
 * Creates everything under a tagged prefix and removes it all in the finally
 * block, mirroring scripts/test-defects.ts and scripts/test-spatial-join.ts.
 *
 *   npx tsx --env-file=.env scripts/test-reports.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
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
} from "@/server/reports/queries-execution";
import { cityCoverageReport, defectsReport, qualityControlReport, resourceUtilizationReport } from "@/server/reports/queries-quality";
import { pendingVerificationReport, sourceConflictsReport } from "@/server/reports/queries-sources";
import { buildCsv, buildExcelBuffer } from "@/server/reports/export";
import { localDateAtTime } from "@/server/dateUtils";

const TAG = "__TEST_REPORTS__";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function near(actual: number | null, expected: number, tol = 0.15) {
  return actual !== null && Math.abs(actual - expected) <= tol;
}

async function cleanup() {
  const zones = await prisma.operationalZone.findMany({ where: { code: { startsWith: TAG } }, select: { id: true } });
  const zoneIds = zones.map((z) => z.id);

  const streets = await prisma.street.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const streetIds = streets.map((s) => s.id);

  const plans = await prisma.workPlan.findMany({ where: { tasks: { some: { street: { name: { startsWith: TAG } } } } }, select: { id: true } });
  const planIds = plans.map((p) => p.id);

  await prisma.workPlanTask.deleteMany({ where: { workPlanId: { in: planIds } } });
  await prisma.workPlan.deleteMany({ where: { id: { in: planIds } } });
  await prisma.streetCleaningLog.deleteMany({ where: { streetId: { in: streetIds } } });
  await prisma.defect.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.inspection.deleteMany({ where: { zoneId: { in: zoneIds } } });
  await prisma.contractAreaResourceQuota.deleteMany({ where: { contractArea: { name: { startsWith: TAG } } } });
  await prisma.street.deleteMany({ where: { id: { in: streetIds } } });
  await prisma.resource.deleteMany({ where: { identifier: { startsWith: TAG } } });
  await prisma.resourceType.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.operationalZone.deleteMany({ where: { id: { in: zoneIds } } });
  await prisma.contractArea.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.contractor.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
}

async function main() {
  console.log("הכנת נתוני בדיקה");
  await cleanup();

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("לא נמצא משתמש ADMIN בבסיס הנתונים");
  const worker = await prisma.user.upsert({
    where: { email: `${TAG.toLowerCase()}_worker@test.local` },
    update: {},
    create: { name: `${TAG} עובד`, email: `${TAG.toLowerCase()}_worker@test.local`, passwordHash: "x", role: "EMPLOYEE" },
  });

  const contractorA = await prisma.contractor.create({ data: { name: `${TAG} קבלן A` } });
  const contractorB = await prisma.contractor.create({ data: { name: `${TAG} קבלן B` } });
  const areaA = await prisma.contractArea.create({ data: { areaNumber: 901, name: `${TAG} אזור מכרז A`, contractorId: contractorA.id } });
  const areaB = await prisma.contractArea.create({ data: { areaNumber: 902, name: `${TAG} אזור מכרז B`, contractorId: contractorB.id } });

  const zoneA = await prisma.operationalZone.create({ data: { code: `${TAG}ZA`, name: `${TAG} אזור A`, color: "#000", contractAreaId: areaA.id } });
  const zoneB = await prisma.operationalZone.create({ data: { code: `${TAG}ZB`, name: `${TAG} אזור B`, color: "#000", contractAreaId: areaB.id } });

  const resourceType = await prisma.resourceType.create({
    data: { code: `${TAG}RT`, name: `${TAG} סוג משאב`, shiftType: "MORNING" },
  });
  const resourceA = await prisma.resource.create({
    data: { resourceTypeId: resourceType.id, identifier: `${TAG}R1`, assignedEmployeeId: worker.id, workHoursStart: "06:00", workHoursEnd: "14:00" },
  });
  const resourceB = await prisma.resource.create({
    data: { resourceTypeId: resourceType.id, identifier: `${TAG}R2`, workHoursStart: "06:00", workHoursEnd: "14:00" },
  });

  const streetA = await prisma.street.create({
    data: { name: `${TAG} רחוב A`, zoneId: zoneA.id, cleaningFrequency: { type: "DAILY" }, source: "MANUAL" },
  });
  const streetB = await prisma.street.create({
    data: { name: `${TAG} רחוב B`, zoneId: zoneB.id, cleaningFrequency: { type: "DAILY" }, source: "MANUAL" },
  });

  // A fixed, deterministic date far from "today" so it never collides with real data.
  const day = new Date(Date.UTC(2026, 5, 15)); // 2026-06-15, a Monday
  const dayStr = "2026-06-15";

  const plan = await prisma.workPlan.create({ data: { date: day, versionNumber: 1, status: "CONFIRMED", createdById: admin.id } });

  // Task 1: zone A / contractor A — completed, planned 40 min, actual 45 min, 1000 m.
  const start1 = localDateAtTime(day, 6, 0);
  const end1 = localDateAtTime(day, 6, 40);
  await prisma.workPlanTask.create({
    data: {
      workPlanId: plan.id, resourceId: resourceA.id, streetId: streetA.id, sequenceOrder: 0,
      plannedStart: start1, plannedEnd: end1, distanceM: 1000, cleanTimeMin: 30, travelTimeMin: 10,
      status: "DONE", actualStart: localDateAtTime(day, 6, 0), actualEnd: localDateAtTime(day, 6, 45),
    },
  });

  // Task 2: zone B / contractor B — not done, planned 25 min, 2000 m, no actual data.
  const start2 = localDateAtTime(day, 6, 0);
  const end2 = localDateAtTime(day, 6, 25);
  await prisma.workPlanTask.create({
    data: {
      workPlanId: plan.id, resourceId: resourceB.id, streetId: streetB.id, sequenceOrder: 0,
      plannedStart: start2, plannedEnd: end2, distanceM: 2000, cleanTimeMin: 20, travelTimeMin: 5,
      status: "NOT_DONE",
    },
  });

  await prisma.contractAreaResourceQuota.create({
    data: { contractAreaId: areaA.id, resourceTypeId: resourceType.id, lineNumber: 1, quantity: 2, shiftHours: 8 },
  });

  await prisma.streetCleaningLog.create({ data: { streetId: streetA.id, date: day, completed: true } });

  const inspection = await prisma.inspection.create({
    data: { date: day, round: "MORNING_10", zoneId: zoneA.id, inspectorId: admin.id, status: "COMPLETED", completedAt: day },
  });
  const defect = await prisma.defect.create({
    data: {
      reference: `${TAG}-DEF-1`, title: `${TAG} ליקוי בדיקה`, zoneId: zoneA.id, contractAreaId: areaA.id,
      origin: "INSPECTION", status: "NEW", reportedById: admin.id, reportedAt: day, inspectionId: inspection.id,
    },
  });

  // -------------------------------------------------------------------
  console.log("\nדוח שבועי לפי אזור");
  const weekly = await weeklyZoneReport(day, day);
  const rowA = weekly.rows.find((r) => r.zone === zoneA.name);
  const rowB = weekly.rows.find((r) => r.zone === zoneB.name);
  check("אזור A מופיע בדוח", !!rowA);
  check("אזור A: משימה אחת מתוכננת", rowA?.planned === 1);
  check("אזור A: משימה אחת בוצעה", rowA?.done === 1);
  check("אזור A: אחוז ביצוע 100", rowA?.completionPercent === 100);
  check('אזור A: ק"מ מתוכנן = 1.0', rowA?.kmPlanned === 1);
  check('אזור A: ק"מ בוצע = 1.0', rowA?.kmDone === 1);
  check("אזור B: משימה אחת לא בוצעה", rowB?.notDone === 1);
  check('אזור B: ק"מ בוצע = 0', rowB?.kmDone === 0);

  console.log("\nדוח חודשי לפי קבלן");
  const monthly = await monthlyContractorReport(day, day, true);
  const areaARow = monthly.rows.find((r) => r.contractArea === areaA.name);
  const areaBRow = monthly.rows.find((r) => r.contractArea === areaB.name);
  check("אזור מכרז A מציג את הקבלן הנכון", areaARow?.contractor === contractorA.name);
  check("אזור מכרז A: משאב אחד הופעל", areaARow?.resourcesDeployed === 1);
  check("אזור מכרז A: ליקוי אחד נפתח", areaARow?.defectsOpened === 1);
  check("אזור מכרז B: משימה לא בוצעה", areaBRow?.tasksNotDone === 1);
  const monthlyNoFinance = await monthlyContractorReport(day, day, false);
  check("ללא הרשאת כספים אין עמודת קיזוזים", !monthlyNoFinance.columns.some((c) => c.key === "deductionsApproved"));

  console.log("\nדוח לפי כלי רכב");
  const byResource = await byResourceReport(resourceA.id, day, day);
  check("דוח הכלי מכיל שורה אחת", byResource.rows.length === 1);
  check("דוח הכלי מציג את הרחוב הנכון", byResource.rows[0]?.street === streetA.name);
  check("דוח הכלי מציג סטטוס בוצע", byResource.rows[0]?.status === "בוצע");

  console.log("\nדוח לפי מנהל עבודה");
  const byWorker = await byWorkerReport(worker.id, day, day);
  check("דוח העובד מוצא את המשימה של הכלי המשויך אליו", byWorker.rows.length === 1 && byWorker.rows[0]?.street === streetA.name);

  console.log("\nדוח משמרת");
  const shift = await shiftReport("MORNING", day);
  check("דוח משמרת בוקר מכיל את שתי המשימות", shift.rows.length === 2);

  console.log("\nכלי רכב שעבדו בכל אזור");
  const zoneVehicles = await zoneVehiclesReport(day);
  check("שני אזורים מופיעים בדוח הכלים", new Set(zoneVehicles.rows.map((r) => r.zone)).size >= 2);

  console.log("\nשעות עבודה מתוכננות מול בפועל");
  const hours = await hoursPlannedVsActualReport(day, day);
  const hoursA = hours.rows.find((r) => (r.resource as string).includes(`${TAG}R1`));
  const hoursB = hours.rows.find((r) => (r.resource as string).includes(`${TAG}R2`));
  check("כלי A: שעות מתוכננות תואמות (40 דק' = 0.67 שעות)", near(hoursA?.plannedHours as number, 40 / 60));
  check("כלי A: שעות בפועל תואמות (45 דק' = 0.75 שעות)", near(hoursA?.actualHours as number, 45 / 60));
  check("כלי A: פער חיובי (יותר זמן מהמתוכנן)", (hoursA?.varianceHours as number) > 0);
  check("כלי B: ללא נתוני בפועל, actualHours הוא null", hoursB?.actualHours === null);

  console.log("\nרחובות שבוצעו / לא בוצעו");
  const doneOnly = await streetsCompletionReport(day, day, null, "done");
  const notDoneOnly = await streetsCompletionReport(day, day, null, "not-done");
  check("סינון 'בוצעו' מכיל את רחוב A בלבד", doneOnly.rows.some((r) => r.street === streetA.name) && !doneOnly.rows.some((r) => r.street === streetB.name));
  check("סינון 'לא בוצעו' מכיל את רחוב B בלבד", notDoneOnly.rows.some((r) => r.street === streetB.name) && !notDoneOnly.rows.some((r) => r.street === streetA.name));

  console.log('\nקילומטרים מתוכננים מול מבוצעים');
  const kmByZone = await kmPlannedVsActualReport(day, day, "zone");
  const kmZoneA = kmByZone.rows.find((r) => r.group === zoneA.name);
  check('ק"מ לפי אזור: אזור A מתוכנן=1.0 בוצע=1.0', kmZoneA?.kmPlanned === 1 && kmZoneA?.kmDone === 1);
  const kmByContractor = await kmPlannedVsActualReport(day, day, "contractor");
  const kmContractorB = kmByContractor.rows.find((r) => (r.group as string).includes(contractorB.name));
  check('ק"מ לפי קבלן: קבלן B מתוכנן=2.0 בוצע=0', kmContractorB?.kmPlanned === 2 && kmContractorB?.kmDone === 0);

  console.log("\nדוח ליקויים");
  const defectsRes = await defectsReport({ from: day, to: day, zoneId: null, contractAreaId: null, status: null, showMoney: true });
  check("הליקוי שנוצר מופיע בדוח", defectsRes.rows.some((r) => r.reference === defect.reference));

  console.log("\nדוח בקרת איכות");
  const quality = await qualityControlReport(day, day);
  const qualityA = quality.rows.find((r) => r.zone === zoneA.name);
  check("אזור A: סיור אחד הושלם", qualityA?.inspectionsCompleted === 1);
  check("אזור A: ליקוי אחד התגלה בסיור", qualityA?.defectsFoundInInspection === 1);

  console.log("\nדוח ניצול משאבים מול ההסכם");
  const utilization = await resourceUtilizationReport(day, day, areaA.id);
  const utilRow = utilization.rows[0];
  check("כמות חוזית = 2", utilRow?.contractedQuantity === 2);
  check("ממוצע בפועל ליום = 1", utilRow?.avgActualDeployed === 1);
  check("פער = -1 (מתחת להסכם)", utilRow?.variance === -1);
  check("אינו מסומן כחריגה", utilRow?.overQuota === "לא");

  console.log("\nדוח כיסוי עירוני");
  const coverage = await cityCoverageReport(day);
  const covA = coverage.rows.find((r) => r.street === streetA.name);
  const covB = coverage.rows.find((r) => r.street === streetB.name);
  check("רחוב A נוקה וסטטוסו 'בזמן'", covA?.coverageStatus === "בזמן");
  check("רחוב B מעולם לא נוקה", covB?.coverageStatus === "מעולם לא נוקה");

  console.log("\nדוחות מקורות (ריצה תקינה, ללא נתוני בדיקה ייעודיים)");
  const conflicts = await sourceConflictsReport();
  const pending = await pendingVerificationReport();
  check("דוח סתירות מקור פועל ומחזיר מבנה תקין", Array.isArray(conflicts.rows));
  check("דוח נתונים ממתינים לאימות פועל ומחזיר מבנה תקין", Array.isArray(pending.rows));

  console.log("\nייצוא Excel ו-CSV");
  const excelBuffer = await buildExcelBuffer("בדיקה", weekly.columns, weekly.rows);
  check("קובץ ה-Excel נוצר ואינו ריק", excelBuffer.length > 1000);
  const csv = buildCsv(weekly.columns, weekly.rows);
  check("קובץ ה-CSV מתחיל ב-BOM ומכיל כותרות", csv.startsWith("﻿") && csv.includes("אזור"));
  check("קובץ ה-CSV מכיל את שם האזור בערך", csv.includes(zoneA.name));

  void dayStr;
  console.log(`\n${passed} בדיקות עברו, ${failures.length} נכשלו`);
  if (failures.length > 0) {
    console.error("\nכשלים:");
    for (const f of failures) console.error("  ✗", f);
  }
}

main()
  .catch((e) => {
    console.error("הבדיקה נכשלה בשגיאה:", e);
    failures.push(String(e));
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(failures.length > 0 ? 1 : 0);
  });
