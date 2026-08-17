/**
 * Exercises the resource-allocation recommendation engine against known,
 * hand-computed data: two zones with different street length/frequency/
 * priority under one contract area (checking the largest-remainder
 * apportionment lands on the exact numbers arithmetic predicts), one zone
 * with zero segment data under a second contract area (checking the engine
 * reports "insufficient data" instead of inventing an even split), the
 * pool-shortfall and quota-exceeded warnings, and that an over-quota
 * assignment is rejected unless a reason is supplied and then recorded.
 *
 * Creates everything under a tagged prefix and removes it all in the finally
 * block, mirroring scripts/test-reports.ts and scripts/test-defects.ts.
 *
 *   npx tsx --env-file=.env scripts/test-allocation.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { computeAllocationRecommendation, pickResourcesForAllocation } from "@/server/resources/allocationEngine";
import { checkQuotaForAssignment, QuotaExceededError, setResourceZones } from "@/server/resources/service";

const TAG = "__TEST_ALLOC__";

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

async function cleanup() {
  const zones = await prisma.operationalZone.findMany({ where: { code: { startsWith: TAG } }, select: { id: true } });
  const zoneIds = zones.map((z) => z.id);
  const streets = await prisma.street.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const streetIds = streets.map((s) => s.id);

  await prisma.streetSegment.deleteMany({ where: { streetId: { in: streetIds } } });
  await prisma.street.deleteMany({ where: { id: { in: streetIds } } });

  const resources = await prisma.resource.findMany({ where: { identifier: { startsWith: TAG } }, select: { id: true } });
  const resourceIds = resources.map((r) => r.id);
  await prisma.manualOverride.deleteMany({ where: { entityType: "Resource", entityId: { in: resourceIds } } });
  await prisma.auditLog.deleteMany({ where: { entityType: "Resource", entityId: { in: resourceIds } } });
  await prisma.resource.deleteMany({ where: { id: { in: resourceIds } } });

  // Quotas reference resourceType with an FK RESTRICT, so they must go first.
  await prisma.contractAreaResourceQuota.deleteMany({ where: { contractArea: { name: { startsWith: TAG } } } });
  await prisma.resourceType.deleteMany({ where: { code: { startsWith: TAG } } });

  await prisma.auditLog.deleteMany({ where: { entityType: "ContractArea", entityId: { in: (await prisma.contractArea.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((a) => a.id) } } });
  await prisma.operationalZone.deleteMany({ where: { id: { in: zoneIds } } });
  await prisma.contractArea.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.contractor.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  console.log("הכנת נתוני בדיקה");
  await cleanup();

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("לא נמצא משתמש ADMIN בבסיס הנתונים");

  // ---- Contract area A: two zones with real, different workloads ----------
  const contractorA = await prisma.contractor.create({ data: { name: `${TAG} קבלן A` } });
  const areaA = await prisma.contractArea.create({ data: { areaNumber: 911, name: `${TAG} אזור מכרז A`, contractorId: contractorA.id } });
  const zoneA1 = await prisma.operationalZone.create({ data: { code: `${TAG}A1`, name: `${TAG} אזור A1`, color: "#000", contractAreaId: areaA.id } });
  const zoneA2 = await prisma.operationalZone.create({ data: { code: `${TAG}A2`, name: `${TAG} אזור A2`, color: "#000", contractAreaId: areaA.id } });

  const rt = await prisma.resourceType.create({
    data: { code: `${TAG}RT`, name: `${TAG} סוג משאב`, suitableForRoad: true, suitableForPath: false },
  });

  // Zone A1: 1000m, DAILY (weight 6), CRITICAL (weight 2) -> score 12,000.
  // The engine reads StreetSegment rows directly, so the parent Street here
  // needs no geometry of its own — only the segment's length matters.
  const streetA1 = await prisma.street.create({
    data: { name: `${TAG} רחוב A1`, zoneId: zoneA1.id, priority: "CRITICAL", cleaningFrequency: { type: "DAILY" }, source: "MANUAL" },
  });
  await prisma.streetSegment.create({
    data: { streetId: streetA1.id, zoneId: zoneA1.id, segmentIndex: 0, lengthM: 1000 },
  });

  // Zone A2: 1000m, WEEKLY (weight 1), NORMAL (weight 1) -> score 1,000
  const streetA2 = await prisma.street.create({
    data: { name: `${TAG} רחוב A2`, zoneId: zoneA2.id, priority: "NORMAL", cleaningFrequency: { type: "WEEKLY" }, source: "MANUAL" },
  });
  await prisma.streetSegment.create({
    data: { streetId: streetA2.id, zoneId: zoneA2.id, segmentIndex: 0, lengthM: 1000 },
  });

  // 3 active resources of this type: one already assigned to A1, two free.
  const resource1 = await prisma.resource.create({ data: { resourceTypeId: rt.id, identifier: `${TAG}R1`, allowedZones: { connect: { id: zoneA1.id } } } });
  const resource2 = await prisma.resource.create({ data: { resourceTypeId: rt.id, identifier: `${TAG}R2` } });
  const resource3 = await prisma.resource.create({ data: { resourceTypeId: rt.id, identifier: `${TAG}R3` } });

  // Contracted quantity 13 -> exact apportionment: 12000/13000*13=12, 1000/13000*13=1.
  await prisma.contractAreaResourceQuota.create({
    data: { contractAreaId: areaA.id, resourceTypeId: rt.id, lineNumber: 1, quantity: 13, shiftHours: 8 },
  });

  // ---- Contract area B: one zone, zero segment data ------------------------
  const contractorB = await prisma.contractor.create({ data: { name: `${TAG} קבלן B` } });
  const areaB = await prisma.contractArea.create({ data: { areaNumber: 912, name: `${TAG} אזור מכרז B`, contractorId: contractorB.id } });
  const zoneB1 = await prisma.operationalZone.create({ data: { code: `${TAG}B1`, name: `${TAG} אזור B1`, color: "#000", contractAreaId: areaB.id } });
  await prisma.contractAreaResourceQuota.create({
    data: { contractAreaId: areaB.id, resourceTypeId: rt.id, lineNumber: 1, quantity: 5, shiftHours: 8 },
  });

  console.log("\nחישוב ההמלצה");
  const all = await computeAllocationRecommendation();
  const resultA = all.find((a) => a.contractAreaId === areaA.id);
  const resultB = all.find((a) => a.contractAreaId === areaB.id);
  check("שני אזורי המכרז מופיעים בתוצאה", !!resultA && !!resultB);

  const rtA = resultA!.resourceTypes.find((r) => r.resourceTypeId === rt.id);
  check("סוג המשאב מופיע תחת אזור מכרז A", !!rtA);
  check("אזור מכרז A אינו מסומן כחסר נתונים", rtA?.insufficientData === false);
  check("גודל המאגר הפעיל = 3", rtA?.activePoolSize === 3);
  check("מחסור מהחוזה = 13 - 3 = 10", rtA?.poolShortfall === 10);

  const a1 = rtA!.zones.find((z) => z.zoneId === zoneA1.id);
  const a2 = rtA!.zones.find((z) => z.zoneId === zoneA2.id);
  check("אזור A1 מקבל 12 יחידות (חלוקה לפי עומס 12,000 מתוך 13,000)", a1?.suggestedQuantity === 12, `קיבל ${a1?.suggestedQuantity}`);
  check("אזור A2 מקבל יחידה אחת", a2?.suggestedQuantity === 1, `קיבל ${a2?.suggestedQuantity}`);
  check("סכום ההמלצות שווה בדיוק לכמות החוזית (12+1=13)", (a1?.suggestedQuantity ?? 0) + (a2?.suggestedQuantity ?? 0) === 13);
  check("חלק העומס של A1 הוא כ-92.3%", Math.abs((a1?.workloadSharePercent ?? 0) - 92.3) < 0.5);
  check("אזור A1 מציג כמות נוכחית 1 (המשאב שכבר משויך)", a1?.currentQuantity === 1);
  check("אזור A2 מציג כמות נוכחית 0", a2?.currentQuantity === 0);
  check("פער A1 = 12-1 = 11", a1?.variance === 11);
  check('ק"מ הרחוב באזור A1 מוצג נכון (1.0)', a1?.streetKm === 1);
  check("זמן הניקיון המשוער חושב (לא אפס)", (a1?.estimatedCleanHours ?? 0) > 0);
  check("להסבר יש תוכן", (a1?.explanation.length ?? 0) > 10);

  const rtB = resultB!.resourceTypes.find((r) => r.resourceTypeId === rt.id);
  check("אזור מכרז B מסומן כחסר נתונים (אין אף מקטע)", rtB?.insufficientData === true);
  const b1 = rtB!.zones.find((z) => z.zoneId === zoneB1.id);
  check("אזור B1 מקבל המלצה של 0 (לא חלוקה שווה מומצאת)", b1?.suggestedQuantity === 0);
  check("אזור B1 מסומן כחסר נתוני גבול", b1?.hasBoundaryData === false);
  check("הסבר אזור B1 מזכיר שאין גבול", b1?.explanation.includes("גבול") ?? false);

  console.log("\nבחירת משאבים בפועל להקצאה");
  const picked = await pickResourcesForAllocation(areaA.id, rt.id, { [zoneA1.id]: 2, [zoneA2.id]: 1 });
  const pickedA1 = picked.find((p) => p.zoneId === zoneA1.id);
  const pickedA2 = picked.find((p) => p.zoneId === zoneA2.id);
  check("שני משאבים נבחרו לאזור A1", pickedA1?.resourceIds.length === 2);
  check("משאב אחד נבחר לאזור A2", pickedA2?.resourceIds.length === 1);
  const allPicked = [...(pickedA1?.resourceIds ?? []), ...(pickedA2?.resourceIds ?? [])];
  check("אין כפילות בין המשאבים שנבחרו", new Set(allPicked).size === allPicked.length);
  check(
    "כל שלושת המשאבים בפועל (הקיים + שני החדשים) נכללים",
    [resource1.id, resource2.id, resource3.id].every((id) => allPicked.includes(id))
  );

  console.log("\nאכיפת חריגה מהכמות החוזית");
  // Tiny quota (1) shared by two different resources -> second assignment must be blocked without a reason.
  const tightRt = await prisma.resourceType.create({ data: { code: `${TAG}TIGHT`, name: `${TAG} סוג מוגבל` } });
  const tightZone = await prisma.operationalZone.create({ data: { code: `${TAG}TZ`, name: `${TAG} אזור מוגבל`, color: "#000", contractAreaId: areaA.id } });
  const tightR1 = await prisma.resource.create({ data: { resourceTypeId: tightRt.id, identifier: `${TAG}TR1` } });
  const tightR2 = await prisma.resource.create({ data: { resourceTypeId: tightRt.id, identifier: `${TAG}TR2` } });
  await prisma.contractAreaResourceQuota.create({
    data: { contractAreaId: areaA.id, resourceTypeId: tightRt.id, lineNumber: 2, quantity: 1, shiftHours: 8 },
  });

  await setResourceZones({ resourceId: tightR1.id, zoneIds: [tightZone.id], userId: admin.id, source: "MANUAL" });
  check("המשאב הראשון הוקצה בהצלחה בתוך המכסה", true);

  let blocked = false;
  try {
    await setResourceZones({ resourceId: tightR2.id, zoneIds: [tightZone.id], userId: admin.id, source: "MANUAL" });
  } catch (e) {
    blocked = e instanceof QuotaExceededError;
  }
  check("המשאב השני נחסם ללא נימוק (חריגה מהמכסה)", blocked);

  const quotaCheck = await checkQuotaForAssignment(tightR2.id, [tightZone.id]);
  check("checkQuotaForAssignment מזהה את החריגה ומחזיר פרטים", quotaCheck.length === 1 && quotaCheck[0].contractedQuantity === 1);

  const forced = await setResourceZones({
    resourceId: tightR2.id,
    zoneIds: [tightZone.id],
    userId: admin.id,
    overrideReason: `${TAG} תגבור מאושר לבדיקה`,
    source: "MANUAL",
  });
  check("עם נימוק, ההקצאה חורגת המכסה מצליחה", forced.allowedZones.some((z) => z.id === tightZone.id));

  const override = await prisma.manualOverride.findFirst({ where: { entityType: "Resource", entityId: tightR2.id } });
  check("החריגה נרשמה כתיקון ידני עם הנימוק", override?.reason === `${TAG} תגבור מאושר לבדיקה`);

  const auditEntry = await prisma.auditLog.findFirst({ where: { entityType: "Resource", entityId: tightR2.id, action: "SET_ALLOWED_ZONES" } });
  check("החריגה נרשמה גם ביומן הביקורת", !!auditEntry);

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
