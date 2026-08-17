/**
 * Exercises the street→zone spatial join against known geometry.
 *
 * Creates a throwaway pair of zones and a handful of streets whose expected
 * split is known by construction, runs the real join, and asserts the result.
 * Everything it creates is removed in the finally block, and the join is re-run
 * so the database is left exactly as it was found.
 *
 *   npx tsx --env-file=.env scripts/test-spatial-join.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { setStreetGeometry, type LonLat } from "@/server/geo.service";
import { MIN_CONFIDENT_SEGMENT_M, overrideSegmentZone, runSpatialJoin } from "@/server/geo/spatialJoin";
import { verifySourceData } from "@/server/tender/sourceData";
import { can } from "@/lib/permissions";

const TAG = "__TEST__";

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

function near(actual: number, expected: number, tolerance: number) {
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Two adjacent squares meeting at longitude 34.92. At latitude ~32.18 one
 * degree of longitude is about 94.2 km, so 0.01° ≈ 942 m — the basis for the
 * length assertions below.
 */
const ZONE_A_RING: LonLat[] = [
  [34.90, 32.17],
  [34.92, 32.17],
  [34.92, 32.19],
  [34.90, 32.19],
  [34.90, 32.17],
];
const ZONE_B_RING: LonLat[] = [
  [34.92, 32.17],
  [34.94, 32.17],
  [34.94, 32.19],
  [34.92, 32.19],
  [34.92, 32.17],
];
const DEG_LON_M = 942; // metres per 0.01° longitude at this latitude

async function createZone(code: string, name: string, ring: LonLat[]) {
  const zone = await prisma.operationalZone.create({
    data: {
      code: `${TAG}${code}`,
      name: `${TAG}${name}`,
      color: "#000000",
      description: `${TAG} zone`,
      active: true,
    },
  });
  const wkt = `POLYGON((${ring.map(([lon, lat]) => `${lon} ${lat}`).join(", ")}))`;
  await prisma.$executeRaw`
    UPDATE zones SET geometry = ST_SetSRID(ST_GeomFromText(${wkt}), 4326) WHERE id = ${zone.id}
  `;
  return zone;
}

async function createStreet(name: string, coords: LonLat[], type: "STREET" | "PATH" = "STREET") {
  const street = await prisma.street.create({
    data: {
      name: `${TAG}${name}`,
      type,
      cleaningFrequency: { type: "DAILY" },
      source: "MANUAL",
      active: true,
    },
  });
  await setStreetGeometry(street.id, coords);
  return street;
}

async function cleanup() {
  const streets = await prisma.street.findMany({
    where: { name: { startsWith: TAG } },
    select: { id: true },
  });
  const ids = streets.map((s) => s.id);
  if (ids.length > 0) {
    await prisma.streetSegment.deleteMany({ where: { streetId: { in: ids } } });
    await prisma.manualOverride.deleteMany({
      where: { entityType: "StreetSegment", entityId: { in: ids } },
    });
    await prisma.workPlanTask.deleteMany({ where: { streetId: { in: ids } } });
    await prisma.street.deleteMany({ where: { id: { in: ids } } });
  }
  const zones = await prisma.operationalZone.findMany({
    where: { code: { startsWith: TAG } },
    select: { id: true },
  });
  if (zones.length > 0) {
    const zoneIds = zones.map((z) => z.id);
    await prisma.streetSegment.deleteMany({ where: { zoneId: { in: zoneIds } } });
    await prisma.street.updateMany({ where: { zoneId: { in: zoneIds } }, data: { zoneId: null } });
    await prisma.auditLog.deleteMany({ where: { entityType: "OperationalZone", entityId: { in: zoneIds } } });
    await prisma.operationalZone.deleteMany({ where: { id: { in: zoneIds } } });
  }
}

async function main() {
  console.log("בדיקות נתוני מקור");
  const sourceProblems = verifySourceData();
  check("נתוני המכרז והזוכים עקביים אריתמטית", sourceProblems.length === 0, sourceProblems.join("; "));

  console.log("\nבדיקות הרשאות");
  check("מנהל מערכת רשאי לשייך אזור לקבלן", can("ADMIN", "zones.assignContractArea"));
  check("מנהל עירוני רשאי לשייך אזור לקבלן", can("CITY_MANAGER", "zones.assignContractArea"));
  check("מנהל אגף אינו רשאי לשייך אזור לקבלן", !can("DEPT_MANAGER", "zones.assignContractArea"));
  check("מפקח אינו רשאי לאמת נתוני מקור", !can("INSPECTOR", "sources.verify"));
  check("מנהל אגף אינו רואה מחירים", !can("DEPT_MANAGER", "finance.view"));
  check("תפקיד כספים רואה מחירים", can("FINANCE", "finance.view"));
  check("מנהל קבלן אינו רואה מחירים", !can("CONTRACTOR_MANAGER", "finance.view"));
  check("צפייה בלבד אינה יכולה לערוך גבולות", !can("VIEWER", "zones.editBoundary"));
  check("עובד אינו יכול לפרסם תוכנית", !can("EMPLOYEE", "plans.publish"));
  check("תפקיד לא מוכר אינו מקבל הרשאות", !can("NO_SUCH_ROLE", "sources.view"));
  check("תפקיד ריק אינו מקבל הרשאות", !can(null, "sources.view"));

  console.log("\nבדיקות שיוך גיאוגרפי");
  await cleanup();

  const zoneA = await createZone("ZA", "אזור בדיקה A", ZONE_A_RING);
  const zoneB = await createZone("ZB", "אזור בדיקה B", ZONE_B_RING);

  // Entirely inside zone A: 0.01° of longitude ≈ 942 m.
  const inside = await createStreet("רחוב פנימי", [
    [34.905, 32.175],
    [34.915, 32.175],
  ]);
  // Straddles the shared edge at 34.92, half in each zone.
  const crossing = await createStreet("רחוב חוצה", [
    [34.91, 32.18],
    [34.93, 32.18],
  ]);
  // A path doing the same, to prove paths are handled like streets.
  const crossingPath = await createStreet(
    "שביל חוצה",
    [
      [34.915, 32.185],
      [34.925, 32.185],
    ],
    "PATH"
  );
  // Clips zone B by ~9 m — under the confidence threshold.
  const sliver = await createStreet("רחוב על הגבול", [
    [34.919, 32.188],
    [34.9201, 32.188],
  ]);
  // Two streets sharing a name, one per zone.
  const dupA = await createStreet("רחוב כפול", [
    [34.902, 32.172],
    [34.908, 32.172],
  ]);
  const dupB = await createStreet("רחוב כפול", [
    [34.932, 32.172],
    [34.938, 32.172],
  ]);
  // Far outside both polygons.
  const outside = await createStreet("רחוב מחוץ לאזורים", [
    [34.80, 32.10],
    [34.81, 32.10],
  ]);

  const result = await runSpatialJoin();
  check("השיוך זיהה את שני אזורי הבדיקה", result.zonesWithGeometry >= 2, `נמצאו ${result.zonesWithGeometry}`);

  const segmentsOf = async (streetId: string) =>
    prisma.streetSegment.findMany({ where: { streetId }, orderBy: { segmentIndex: "asc" } });

  // 1. Street fully inside one zone
  const insideSegs = await segmentsOf(inside.id);
  check("רחוב שנמצא כולו באזור אחד מקבל מקטע יחיד", insideSegs.length === 1, `${insideSegs.length} מקטעים`);
  check("המקטע שויך לאזור הנכון", insideSegs[0]?.zoneId === zoneA.id);
  check(
    "אורך המקטע חושב נכון",
    near(insideSegs[0]?.lengthM ?? 0, DEG_LON_M, 30),
    `${insideSegs[0]?.lengthM?.toFixed(1)} מ׳ מול ~${DEG_LON_M}`
  );
  check("רחוב שאינו חוצה אינו מסומן כחוצה", insideSegs[0]?.crossesZones === false);

  // 2. Street crossing two zones
  const crossSegs = await segmentsOf(crossing.id);
  check("רחוב שחוצה שני אזורים מפוצל לשני מקטעים", crossSegs.length === 2, `${crossSegs.length} מקטעים`);
  check(
    "המקטעים שויכו לשני אזורים שונים",
    new Set(crossSegs.map((s) => s.zoneId)).size === 2
  );
  const crossTotal = crossSegs.reduce((s, x) => s + (x.lengthM ?? 0), 0);
  check(
    "סכום אורכי המקטעים שווה לאורך הרחוב",
    near(crossTotal, DEG_LON_M * 2, 60),
    `${crossTotal.toFixed(1)} מ׳ מול ~${DEG_LON_M * 2}`
  );
  check(
    "כל מקטע מהווה כמחצית מהרחוב",
    crossSegs.every((s) => near(s.lengthM ?? 0, DEG_LON_M, 60)),
    crossSegs.map((s) => s.lengthM?.toFixed(1)).join(" / ")
  );
  check("מקטעי רחוב חוצה מסומנים כחוצי אזורים", crossSegs.every((s) => s.crossesZones));
  const crossStreet = await prisma.street.findUnique({ where: { id: crossing.id } });
  check("הרחוב עצמו מסומן כחוצה אזורים", crossStreet?.crossesZones === true);
  check("שיוך הרחוב הראשי הוא לאחד משני האזורים", [zoneA.id, zoneB.id].includes(crossStreet?.zoneId ?? ""));

  // 3. Path crossing zones
  const pathSegs = await segmentsOf(crossingPath.id);
  check("שביל שחוצה אזורים מפוצל אף הוא", pathSegs.length === 2, `${pathSegs.length} מקטעים`);
  const pathStreet = await prisma.street.findUnique({ where: { id: crossingPath.id } });
  check("סוג השביל נשמר לאחר הפיצול", pathStreet?.type === "PATH");

  // 4. Boundary sliver
  const sliverSegs = await segmentsOf(sliver.id);
  const shortSeg = sliverSegs.find((s) => (s.lengthM ?? 0) < MIN_CONFIDENT_SEGMENT_M);
  check("מקטע קצר על הגבול נוצר", !!shortSeg, `אורכים: ${sliverSegs.map((s) => s.lengthM?.toFixed(1)).join(", ")}`);
  check("מקטע קצר על הגבול מסומן לבדיקה", shortSeg?.verificationStatus === "REQUIRES_REVIEW");
  check("מקטע קצר על הגבול מקבל ביטחון נמוך", shortSeg?.confidence === "LOW");

  // 5. Same name, different places
  const dupASegs = await segmentsOf(dupA.id);
  const dupBSegs = await segmentsOf(dupB.id);
  check("רחובות בעלי אותו שם הם רשומות נפרדות", dupA.id !== dupB.id);
  check("רחוב כפול ראשון שויך לאזור A", dupASegs[0]?.zoneId === zoneA.id);
  check("רחוב כפול שני שויך לאזור B", dupBSegs[0]?.zoneId === zoneB.id);

  // 6. Street outside every zone
  const outsideSegs = await segmentsOf(outside.id);
  check("רחוב מחוץ לכל האזורים אינו מקבל מקטעים", outsideSegs.length === 0);
  const outsideStreet = await prisma.street.findUnique({ where: { id: outside.id } });
  check("רחוב מחוץ לאזורים נשאר ללא שיוך", outsideStreet?.zoneId === null);

  // 7. A stale crossing flag must not survive a run that produces no segments
  //    for the street — otherwise the reports keep counting streets that no
  //    longer cross anything.
  const stale = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n
    FROM streets s
    WHERE s.crosses_zones = true
      AND NOT EXISTS (SELECT 1 FROM street_segments seg WHERE seg.street_id = s.id)
  `;
  check("אין רחוב שמסומן כחוצה אזורים בלי מקטעים", Number(stale[0].n) === 0, `${stale[0].n} רחובות`);

  // 8. No duplicate assignment of one segment
  const dupCheck = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM (
      SELECT street_id, segment_index, COUNT(*) c
      FROM street_segments GROUP BY street_id, segment_index HAVING COUNT(*) > 1
    ) d
  `;
  check("אין כפל שיבוץ של אותו מקטע", Number(dupCheck[0].n) === 0);

  // 8. Manual correction survives recomputation — the property that makes the
  //    join safe to re-run at all.
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!admin) {
    check("נמצא משתמש מנהל לבדיקת התיקון הידני", false, "אין משתמש ADMIN בבסיס הנתונים");
  } else {
    const target = insideSegs[0];
    await overrideSegmentZone({
      segmentId: target.id,
      zoneId: zoneB.id,
      userId: admin.id,
      reason: "בדיקה אוטומטית",
    });

    const rerun = await runSpatialJoin();
    check("הרצה חוזרת מדלגת על רחובות עם תיקון ידני", rerun.protectedStreets >= 1, `${rerun.protectedStreets}`);

    const after = await prisma.streetSegment.findUnique({ where: { id: target.id } });
    check("המקטע המתוקן שרד את ההרצה החוזרת", !!after, "המקטע נמחק");
    check("התיקון הידני לא נדרס", after?.zoneId === zoneB.id, `שויך ל-${after?.zoneId}`);
    check("סימון התיקון הידני נשמר", after?.manuallyOverridden === true);
    check("המקטע המתוקן מסומן כמאומת", after?.verificationStatus === "VERIFIED");

    const override = await prisma.manualOverride.findFirst({
      where: { entityType: "StreetSegment", entityId: target.id },
    });
    check("התיקון הידני נרשם בטבלת ההחלטות", !!override);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { entityType: "StreetSegment", entityId: target.id, action: "OVERRIDE_SEGMENT_ZONE" },
    });
    check("התיקון הידני נרשם ביומן הביקורת", !!auditEntry);

    // The unprotected streets must still be recomputed normally.
    const crossAfter = await segmentsOf(crossing.id);
    check("רחובות שאינם מוגנים חושבו מחדש כרגיל", crossAfter.length === 2, `${crossAfter.length} מקטעים`);
  }

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
    // Leave the database exactly as it was found.
    await runSpatialJoin().catch(() => {});
    await prisma.$disconnect();
    process.exit(failures.length > 0 ? 1 : 0);
  });
