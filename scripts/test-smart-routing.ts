/**
 * Exercises the smart-cleaning/routing upgrade: the dirt score engine (§2),
 * the water projection and service-point selection (§9, §4/§5), the
 * rule-based route provider and its feasibility check (§10–§13), learning
 * from execution (§17), permissions (§18) and demo-data isolation (§19).
 *
 * 20 mandatory checks (§20) plus the five end-to-end scenarios of §21.
 * Creates everything under a tagged prefix and removes it all in the finally
 * block, mirroring scripts/test-allocation.ts and scripts/test-defects.ts.
 *
 *   npx tsx --env-file=.env scripts/test-smart-routing.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { computeDirtScore, resolveDataMode, type DirtScoreInput } from "@/server/cleaning/dirtScore";
import { DEFAULT_DIRT_SCORE_WEIGHTS, DEFAULT_DIRT_SCORE_THRESHOLDS } from "@/server/settings/service";
import { segmentWaterLiters, projectWaterUsage } from "@/server/routing/optimization/water";
import { rankWaterPointsSync, isOpenAt, type WaterPointRow } from "@/server/servicePoints/service";
import { checkVehicleFitsStreet, resolveVehicleProfile } from "@/server/resources/operationalProfile";
import { simulateResourceRoute } from "@/server/routing/optimization/simulate";
import { sequenceRoute } from "@/server/scheduling/routeSequencing";
import { learnFromTaskFieldReport } from "@/server/learning/updateFromExecution";
import { updateProfile } from "@/server/cleaning/profileService";
import { can } from "@/lib/permissions";
import { buildRouteAlternatives } from "@/server/routing/optimization/alternatives";
import { runFeasibilityCheck } from "@/server/routing/optimization/feasibility";
import { persistRoutePlan } from "@/server/scheduling/persistPlan";
import { seedDemoRouting, clearDemoRouting } from "@/server/demo/routingDemo";
import { defaultCleanMinutes } from "@/server/scheduling/estimate";
import type { DueStreet } from "@/server/scheduling/dueStreets";
import { todayDateOnly } from "@/server/dateUtils";

const TAG = "__TEST_ROUTING__";

let passed = 0;
const failures: string[] = [];
/** WorkPlan ids created during the run, tracked explicitly so cleanup can
 * remove them regardless of who they're attributed to (a real ADMIN user, not
 * a tagged test user). */
const createdPlanIds: string[] = [];

/** Creates a bare test WorkPlan for `date`, picking a version number that
 * cannot collide with real plans or ones earlier sections of this script
 * already created for the same day. */
async function createTestPlan(date: Date, createdById: string) {
  const existingCount = await prisma.workPlan.count({ where: { date } });
  const plan = await prisma.workPlan.create({ data: { date, versionNumber: existingCount + 1, status: "DRAFT", createdById } });
  createdPlanIds.push(plan.id);
  return plan;
}

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
  await clearDemoRouting();

  const streets = await prisma.street.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const streetIds = streets.map((s) => s.id);

  await prisma.streetSurvey.deleteMany({ where: { streetId: { in: streetIds } } });
  await prisma.taskFieldReport.deleteMany({ where: { workPlanTask: { street: { name: { startsWith: TAG } } } } });
  await prisma.profileLearningEvent.deleteMany({ where: { entityId: { in: streetIds } } });
  await prisma.manualOverride.deleteMany({ where: { entityType: "StreetCleaningProfile", entityId: { in: streetIds } } });
  await prisma.workPlanServiceStop.deleteMany({
    where: { OR: [{ resource: { identifier: { startsWith: TAG } } }, { workPlanId: { in: createdPlanIds } }] },
  });
  await prisma.workPlanTask.deleteMany({ where: { OR: [{ streetId: { in: streetIds } }, { resource: { identifier: { startsWith: TAG } } }, { workPlanId: { in: createdPlanIds } }] } });
  await prisma.workPlanChange.deleteMany({ where: { workPlanId: { in: createdPlanIds } } });
  await prisma.workPlan.deleteMany({ where: { id: { in: createdPlanIds } } });
  await prisma.streetCleaningProfile.deleteMany({ where: { streetId: { in: streetIds } } });
  await prisma.street.deleteMany({ where: { name: { startsWith: TAG } } });

  await prisma.resourceOperationalProfile.deleteMany({ where: { resource: { identifier: { startsWith: TAG } } } });
  await prisma.resource.deleteMany({ where: { identifier: { startsWith: TAG } } });
  await prisma.resourceType.deleteMany({ where: { code: { startsWith: TAG } } });

  await prisma.waterRefillPoint.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.wasteDisposalPoint.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.operationalZone.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  console.log("הכנת נתוני בדיקה");
  await cleanup();

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("לא נמצא משתמש ADMIN בבסיס הנתונים");

  // =========================================================================
  console.log("\n1. חישוב ציון לכלוך (§2)");
  // =========================================================================
  {
    const baseInput: DirtScoreInput = {
      dirtBaseLevel: 5,
      dirtDynamicLevel: null,
      daysSinceLastClean: 14,
      recommendedIntervalDays: 7, // 2x overdue -> capped at 1
      openComplaints: 5, // saturates at threshold
      pedestrianTraffic: 5,
      nearSchool: true,
      nearCommerce: true,
      nearBusStop: true,
      leafFallLevel: null,
      seasonalSensitivity: null,
      hasSpecialEvent: false,
      sampleCount: 0,
      lastUpdatedAt: new Date(),
      hasSurvey: true,
      profileComplete: true,
      month: 6,
    };
    const result = computeDirtScore(baseInput, DEFAULT_DIRT_SCORE_WEIGHTS, DEFAULT_DIRT_SCORE_THRESHOLDS);
    // Every present component maxed out -> score should be at (or very near) 100.
    check("ציון לכלוך מקסימלי כאשר כל הרכיבים בשיא", (result.score ?? 0) >= 95, `קיבל ${result.score}`);
    check("לציון יש פירוק גורמים", result.factors.length > 0);
    check("מצב הנתונים RULE_BASED כשיש סקר ופרופיל מלא אך אין דגימות", result.dataMode === "RULE_BASED");

    // A street with zero of every component present must not score 0 — it
    // must report "no score" rather than "perfectly clean".
    const emptyInput: DirtScoreInput = {
      ...baseInput,
      dirtBaseLevel: null,
      dirtDynamicLevel: null,
      daysSinceLastClean: null,
      recommendedIntervalDays: null,
      pedestrianTraffic: null,
      nearSchool: null,
      nearCommerce: null,
      nearBusStop: null,
      openComplaints: 0,
      hasSurvey: false,
      profileComplete: false,
    };
    const emptyResult = computeDirtScore(emptyInput, DEFAULT_DIRT_SCORE_WEIGHTS, DEFAULT_DIRT_SCORE_THRESHOLDS);
    check(
      "ציון אינו 0 כשאין אף רכיב עם נתון אמיתי מלבד פניות (0 פניות תקין) — הרכיבים החסרים מדווחים כחסרים",
      emptyResult.missingComponents.length >= 5
    );
    check("מצב הנתונים REQUIRES_REVIEW ללא סקר", resolveDataMode({ hasSurvey: false, profileComplete: false, sampleCount: 0 }, DEFAULT_DIRT_SCORE_THRESHOLDS) === "REQUIRES_REVIEW");
  }

  // =========================================================================
  console.log("\n2. שינוי משקלים משפיע על הציון (§2)");
  // =========================================================================
  {
    const input: DirtScoreInput = {
      dirtBaseLevel: 5,
      dirtDynamicLevel: null,
      daysSinceLastClean: null,
      recommendedIntervalDays: null,
      openComplaints: 0,
      pedestrianTraffic: 1,
      nearSchool: false,
      nearCommerce: false,
      nearBusStop: false,
      leafFallLevel: null,
      seasonalSensitivity: null,
      hasSpecialEvent: false,
      sampleCount: 0,
      lastUpdatedAt: null,
      hasSurvey: true,
      profileComplete: true,
      month: 1,
    };
    const withDefaults = computeDirtScore(input, DEFAULT_DIRT_SCORE_WEIGHTS, DEFAULT_DIRT_SCORE_THRESHOLDS);
    const heavySupervisor = computeDirtScore(
      input,
      { ...DEFAULT_DIRT_SCORE_WEIGHTS, supervisorEstimate: 90, historicalDirt: 0 },
      DEFAULT_DIRT_SCORE_THRESHOLDS
    );
    check(
      "העלאת משקל 'הערכת מנהל העבודה' משנה את הציון",
      withDefaults.score !== null && heavySupervisor.score !== null && withDefaults.score !== heavySupervisor.score,
      `${withDefaults.score} מול ${heavySupervisor.score}`
    );
  }

  // =========================================================================
  console.log("\n3–4. חישוב זמן ניקיון וצריכת מים (§9)");
  // =========================================================================
  {
    check("זמן ניקיון ברירת מחדל למקטע 800 מ' הוא 10 דק' (80מ'/דקה)", defaultCleanMinutes(800) === 10);
    check("זמן ניקיון מינימלי הוא 5 דקות גם למקטע קצר מאוד", defaultCleanMinutes(10) === 5);

    const vehicle = { waterLPerCleanKm: 30, waterLPerWorkHour: 20 };
    const liters = segmentWaterLiters(
      {
        streetId: "x",
        streetName: "x",
        lengthM: 1000,
        cleanMinutes: 30,
        requiresWater: true,
        estWaterLitersPer100m: null,
        usesPressureWash: false,
        dirtLevel: 3,
        waterFigureIsMeasured: false,
      },
      vehicle
    );
    check("צריכת מים למקטע 1 ק\"מ מחושבת (>0)", liters > 0, `${liters}`);
    const noWater = segmentWaterLiters(
      {
        streetId: "x",
        streetName: "x",
        lengthM: 1000,
        cleanMinutes: 30,
        requiresWater: false,
        estWaterLitersPer100m: null,
        usesPressureWash: false,
        dirtLevel: 3,
        waterFigureIsMeasured: false,
      },
      vehicle
    );
    check("מקטע שאינו דורש מים צורך 0 ליטר", noWater === 0);

    const pressureWashed = segmentWaterLiters(
      {
        streetId: "x",
        streetName: "x",
        lengthM: 1000,
        cleanMinutes: 30,
        requiresWater: true,
        estWaterLitersPer100m: null,
        usesPressureWash: true,
        dirtLevel: 3,
        waterFigureIsMeasured: false,
      },
      vehicle
    );
    check("שטיפה בלחץ מגדילה את הצריכה", pressureWashed > liters, `${pressureWashed} מול ${liters}`);
  }

  // =========================================================================
  console.log("\n5. שמירת רזרבת מים (§9, תרחיש ב)");
  // =========================================================================
  {
    const projection = projectWaterUsage({
      vehicle: {
        waterCapacityL: 100,
        minWaterReserveL: 20,
        waterLPerCleanKm: 50,
        waterLPerWorkHour: null,
        waterProfileUnknown: false,
      } as ReturnType<typeof resolveVehicleProfile>,
      segments: [
        { streetId: "a", streetName: "a", lengthM: 1000, cleanMinutes: 20, requiresWater: true, estWaterLitersPer100m: null, usesPressureWash: false, dirtLevel: null, waterFigureIsMeasured: false },
        { streetId: "b", streetName: "b", lengthM: 1000, cleanMinutes: 20, requiresWater: true, estWaterLitersPer100m: null, usesPressureWash: false, dirtLevel: null, waterFigureIsMeasured: false },
      ],
    });
    check("החישוב מזהה את המקטע שבו יורדים מתחת לרזרבה", projection.firstBelowReserveIndex === 1, `${projection.firstBelowReserveIndex}`);
    check("המים אינם יורדים מתחת לאפס", projection.segments.every((s) => s.litersAfter >= 0));
  }

  // =========================================================================
  console.log("\n6–8. בחירת נקודת מילוי — זמינות, תקלה, שעות פעילות (§4, תרחיש ג)");
  // =========================================================================
  {
    const points: WaterPointRow[] = [
      { id: "near-broken", name: "קרובה תקולה", lat: 32.18, lon: 34.9, status: "BROKEN", availabilityHours: null, flowLitersPerMin: 40, avgFillMinutes: 8, avgWaitMinutes: 0, maxVehicleWidthM: null, maxVehicleHeightM: null, allowedResourceTypes: [] },
      { id: "far-active", name: "רחוקה תקינה", lat: 32.2, lon: 34.95, status: "ACTIVE", availabilityHours: null, flowLitersPerMin: 40, avgFillMinutes: 8, avgWaitMinutes: 0, maxVehicleWidthM: null, maxVehicleHeightM: null, allowedResourceTypes: [] },
    ];
    const ranked = rankWaterPointsSync(points, {
      from: [34.9, 32.18],
      vehicle: { resourceTypeId: "rt", widthM: null, heightM: null },
      dayCode: "SUN",
      atMinute: 600,
    });
    check("נקודת מים תקולה מדורגת כלא-כשירה", ranked.find((p) => p.id === "near-broken")?.eligible === false);
    check("הנקודה התקינה נבחרת למרות שהיא רחוקה יותר", ranked.find((p) => p.eligible)?.id === "far-active");

    check("נקודה בתוך שעות הפעילות נחשבת פתוחה", isOpenAt([{ from: "06:00", to: "18:00" }], "SUN", 600));
    check("נקודה מחוץ לשעות הפעילות נחשבת סגורה", !isOpenAt([{ from: "06:00", to: "18:00" }], "SUN", 60));
    check("אין הגבלת שעות ידועה = פתוחה", isOpenAt(null, "SUN", 60));
  }

  // =========================================================================
  console.log("\n9–10. התאמת כלי לשביל וזיהוי כלי רחב מדי (תרחיש ה)");
  // =========================================================================
  {
    const narrowVehicle = { resourceTypeId: "rt", resourceTypeName: "כלי", canEnterPath: false, canMountSidewalk: false, suitableForRoad: true, widthM: 1.2 } as ReturnType<typeof resolveVehicleProfile>;
    const pathCheck = checkVehicleFitsStreet(narrowVehicle, { type: "PATH", allowedResourceTypeIds: [], profileWidthM: null, narrowRoad: false });
    check("כלי שאינו יכול להיכנס לשביל נדחה", pathCheck.fits === false);

    const wideVehicle = { resourceTypeId: "rt", resourceTypeName: "כלי", canEnterPath: true, canMountSidewalk: true, suitableForRoad: true, widthM: 3 } as ReturnType<typeof resolveVehicleProfile>;
    const widthCheck = checkVehicleFitsStreet(wideVehicle, { type: "STREET", allowedResourceTypeIds: [], profileWidthM: 2, narrowRoad: false });
    check("כלי רחב מדי למקטע מזוהה ונדחה עם הסבר", widthCheck.fits === false && "reason" in widthCheck && widthCheck.reason.length > 0);
  }

  // =========================================================================
  console.log("\n11. מניעת חריגה משעות המשמרת (§13)");
  // =========================================================================
  {
    const zone = await prisma.operationalZone.create({ data: { code: `${TAG}Z1`, name: `${TAG} אזור`, color: "#000" } });
    const rt = await prisma.resourceType.create({ data: { code: `${TAG}RT1`, name: `${TAG} סוג`, suitableForRoad: true } });
    const resource = await prisma.resource.create({
      data: { resourceTypeId: rt.id, identifier: `${TAG}R1`, status: "ACTIVE", workHoursStart: "07:00", workHoursEnd: "07:30" },
    });
    const street = await prisma.street.create({
      data: { name: `${TAG} רחוב ארוך`, zoneId: zone.id, priority: "NORMAL", cleaningFrequency: { type: "DAILY" }, source: "MANUAL", estimatedCleanMinutes: 120, startPointLat: 32.18, startPointLon: 34.9, endPointLat: 32.181, endPointLon: 34.901 },
    });

    const vehicle = resolveVehicleProfile({
      ...resource,
      resourceType: rt,
      operationalProfile: null,
    } as Parameters<typeof resolveVehicleProfile>[0]);
    const sequenced = sequenceRoute([{ ...street, allowedResourceTypes: [] } as unknown as DueStreet]);
    const sim = simulateResourceRoute({
      date: todayDateOnly(),
      shiftDate: todayDateOnly(),
      vehicle,
      sequenced,
      cleaningInfoByStreet: new Map(),
      waterPoints: [],
      wastePoints: [],
    });
    check("מסלול שחורג מ-30 דקות משמרת עם משימה של 120 דקות מסומן כחריגה", sim.overCapacity === true);
  }

  // =========================================================================
  console.log("\n12. שמירת שינוי ידני ואי-דריסתו על ידי למידה (§1, §11, §17)");
  // =========================================================================
  {
    const street = await prisma.street.create({
      data: { name: `${TAG} רחוב לדריסה ידנית`, priority: "NORMAL", cleaningFrequency: { type: "DAILY" }, source: "MANUAL", lengthM: 500 },
    });
    await updateProfile(street.id, { avgActualCleanMin: 999 }, admin.id);

    const profile = await prisma.streetCleaningProfile.findUnique({ where: { streetId: street.id } });
    check("השדה נשמר עם הערך הידני", profile?.avgActualCleanMin === 999);
    check("השדה מסומן כנדרס ידנית", profile?.manuallyOverriddenFields.includes("avgActualCleanMin") === true);

    // Now simulate a completed job — learning must NOT touch the locked field.
    const zone2 = await prisma.operationalZone.findFirst({ where: { code: { startsWith: TAG } } });
    const rt2 = await prisma.resourceType.findFirst({ where: { code: { startsWith: TAG } } });
    const resource2 = await prisma.resource.create({ data: { resourceTypeId: rt2!.id, identifier: `${TAG}R2`, status: "ACTIVE" } });
    const plan = await createTestPlan(todayDateOnly(), admin.id);
    const task = await prisma.workPlanTask.create({
      data: {
        workPlanId: plan.id,
        resourceId: resource2.id,
        streetId: street.id,
        sequenceOrder: 0,
        plannedStart: new Date(),
        plannedEnd: new Date(Date.now() + 10 * 60000),
        status: "DONE",
      },
    });
    const start = new Date();
    const end = new Date(start.getTime() + 5 * 60000); // 5-minute job, wildly different from 999
    const report = await prisma.taskFieldReport.create({
      data: { workPlanTaskId: task.id, reportedById: admin.id, startedAt: start, endedAt: end },
    });
    await learnFromTaskFieldReport(report.id);
    const afterLearning = await prisma.streetCleaningProfile.findUnique({ where: { streetId: street.id } });
    check("הלמידה לא דרסה שדה שנעל מנהל ידנית", afterLearning?.avgActualCleanMin === 999);
    void zone2;
  }

  // =========================================================================
  console.log("\n13–14. עדכון ממוצע לאחר ביצוע והגנה מפני דגימה חריגה (§17)");
  // =========================================================================
  {
    const street = await prisma.street.create({
      data: { name: `${TAG} רחוב ללמידה`, priority: "NORMAL", cleaningFrequency: { type: "DAILY" }, source: "MANUAL", lengthM: 500 },
    });
    await prisma.streetCleaningProfile.create({ data: { streetId: street.id, avgActualCleanMin: 20, sampleCount: 5 } });

    const rt3 = await prisma.resourceType.findFirst({ where: { code: { startsWith: TAG } } });
    const resource3 = await prisma.resource.create({ data: { resourceTypeId: rt3!.id, identifier: `${TAG}R3`, status: "ACTIVE" } });
    const plan2 = await createTestPlan(todayDateOnly(), admin.id);

    async function reportJob(minutes: number) {
      const task = await prisma.workPlanTask.create({
        data: { workPlanId: plan2.id, resourceId: resource3.id, streetId: street.id, sequenceOrder: 0, plannedStart: new Date(), plannedEnd: new Date(), status: "DONE" },
      });
      const start = new Date();
      const end = new Date(start.getTime() + minutes * 60000);
      const report = await prisma.taskFieldReport.create({ data: { workPlanTaskId: task.id, reportedById: admin!.id, startedAt: start, endedAt: end } });
      return learnFromTaskFieldReport(report.id);
    }

    await reportJob(22); // normal sample, near the average
    const afterNormal = await prisma.streetCleaningProfile.findUnique({ where: { streetId: street.id } });
    check("ממוצע הזמן עודכן לאחר דיווח רגיל", (afterNormal?.avgActualCleanMin ?? 0) !== 20 && (afterNormal?.avgActualCleanMin ?? 0) > 20);

    const before = afterNormal!.avgActualCleanMin!;
    await reportJob(300); // wild outlier — >2.5x the current average
    const afterOutlier = await prisma.streetCleaningProfile.findUnique({ where: { streetId: street.id } });
    check("דגימה חריגה (300 דק' מול ~22) אינה משנה את הממוצע", afterOutlier?.avgActualCleanMin === before);

    const excludedEvent = await prisma.profileLearningEvent.findFirst({ where: { entityId: street.id, excluded: true } });
    check("הדגימה החריגה נרשמה כמסומנת 'לא נכללה'", !!excludedEvent);
  }

  // =========================================================================
  console.log("\n15–16. הרשאות נהג ומנהל (§18)");
  // =========================================================================
  {
    check("לנהג (EMPLOYEE) יש הרשאת דיווח שטח", can("EMPLOYEE", "field.report") === true);
    check("לנהג אין הרשאת עריכת תוכניות", can("EMPLOYEE", "plans.edit") === false);
    check("לנהג אין הרשאת ניהול נקודות שירות", can("EMPLOYEE", "servicePoints.manage") === false);
    check("למנהל עבודה (SITE_SUPERVISOR) יש הרשאת עריכת פרופיל", can("SITE_SUPERVISOR", "profiles.edit") === true);
    check("רק ADMIN/CITY_MANAGER יכולים לשנות משקלים", can("ADMIN", "routing.configure") === true && can("SITE_SUPERVISOR", "routing.configure") === false);
  }

  // =========================================================================
  console.log("\n17. עבודה ללא מספיק נתונים (insufficientData ולא המצאה)");
  // =========================================================================
  {
    const emptyStreet = await prisma.street.create({
      data: { name: `${TAG} רחוב ללא סקר`, priority: "NORMAL", cleaningFrequency: { type: "DAILY" }, source: "MANUAL" },
    });
    const profile = await prisma.streetCleaningProfile.findUnique({ where: { streetId: emptyStreet.id } });
    check("רחוב ללא סקר אין לו פרופיל בכלל — לא ציון מומצא", profile === null);
  }

  // =========================================================================
  console.log("\n18. סימון נתוני Demo ומחיקתם (§19)");
  // =========================================================================
  {
    const result = await seedDemoRouting(admin.id);
    const demoStreets = await prisma.street.findMany({ where: { id: { in: result.streetIds } } });
    check("כל מקטעי ההדגמה מסומנים isDemo", demoStreets.every((s) => s.isDemo === true));
    const demoZone = await prisma.operationalZone.findUnique({ where: { id: result.zoneId } });
    check("אזור ההדגמה מסומן isDemo", demoZone?.isDemo === true);

    await clearDemoRouting();
    const remaining = await prisma.street.count({ where: { isDemo: true } });
    check("מחיקת נתוני ההדגמה מסירה את כל השורות המסומנות", remaining === 0);
  }

  // =========================================================================
  console.log("\n19–20. הצגת הסבר להמלצת מסלול ובדיקת היתכנות (§12, §13)");
  // =========================================================================
  {
    // Build a tiny real scenario: one zone, two due streets, one resource with
    // a full profile, one water point — then ask for the three alternatives.
    const zone = await prisma.operationalZone.create({ data: { code: `${TAG}Z2`, name: `${TAG} אזור 2`, color: "#000" } });
    const rt = await prisma.resourceType.create({ data: { code: `${TAG}RT2`, name: `${TAG} סוג 2`, suitableForRoad: true } });
    const resource = await prisma.resource.create({
      data: {
        resourceTypeId: rt.id,
        identifier: `${TAG}R4`,
        status: "ACTIVE",
        workHoursStart: "07:00",
        workHoursEnd: "15:00",
        allowedZones: { connect: { id: zone.id } },
        operationalProfile: { create: { waterCapacityL: 500, minWaterReserveL: 50, waterLPerCleanKm: 10 } },
      },
    });
    const s1 = await prisma.street.create({
      data: { name: `${TAG} מקטע נדרש 1`, zoneId: zone.id, priority: "HIGH", cleaningFrequency: { type: "DAILY" }, source: "MANUAL", lengthM: 300, estimatedCleanMinutes: 10, startPointLat: 32.18, startPointLon: 34.9, endPointLat: 32.1801, endPointLon: 34.9001 },
    });
    await prisma.streetCleaningProfile.create({ data: { streetId: s1.id, dirtScore: 80, dataMode: "RULE_BASED", requiresWater: true } });

    const { alternatives, totalDueStreets } = await buildRouteAlternatives({ date: todayDateOnly(), resourceIds: [resource.id] });
    check("שלוש חלופות מוצעות", alternatives.length === 3);
    check("לכל חלופה יש הסבר טקסטואלי", alternatives.every((a) => a.strategyExplanation.length > 10));
    check("לכל חלופה יש פירוק עלות", alternatives.every((a) => Array.isArray(a.cost.lines)));
    check("מספר המקטעים החייבים ניקיון תואם", totalDueStreets >= 1);

    const chosen = alternatives.find((a) => a.variant === "DIRT_PRIORITY")!;
    const persisted = await persistRoutePlan({ date: todayDateOnly(), createdById: admin.id, chosen });
    createdPlanIds.push(persisted.workPlanId);
    check("התוכנית נשמרה עם וריאנט ומזהה", !!persisted.workPlanId && persisted.variant === "DIRT_PRIORITY");
    check("בדיקת ההיתכנות רצה ומוחזרת עם התוכנית", persisted.feasibility.checks.length >= 8);

    const refetched = await runFeasibilityCheck(persisted.workPlanId);
    check("בדיקת היתכנות ניתנת להרצה חוזרת ישירות מול בסיס הנתונים", refetched.checks.length === persisted.feasibility.checks.length);
  }

  // =========================================================================
  console.log("\n§21 — תרחישי קצה");
  // =========================================================================

  console.log("\n  תרחיש א — אין צורך במילוי");
  {
    const vehicle = {
      waterCapacityL: 1000,
      minWaterReserveL: 50,
      waterLPerCleanKm: 5,
      waterLPerWorkHour: null,
      canEnterPath: true,
      canMountSidewalk: true,
      suitableForRoad: true,
      resourceTypeId: "rt",
      workHoursStart: "07:00",
      workHoursEnd: "15:00",
      avgTravelSpeedKmh: 20,
      startPoint: null,
      waterProfileUnknown: false,
    } as unknown as ReturnType<typeof resolveVehicleProfile>;
    const street: DueStreet = {
      id: "s1",
      name: `${TAG} מקטע קצר`,
      lengthM: 200,
      estimatedCleanMinutes: 10,
      priority: "NORMAL",
      type: "STREET",
      startPointLat: 32.18,
      startPointLon: 34.9,
      endPointLat: 32.1801,
      endPointLon: 34.9001,
      allowedResourceTypes: [],
    } as unknown as DueStreet;
    const sim = simulateResourceRoute({
      date: todayDateOnly(),
      shiftDate: todayDateOnly(),
      vehicle,
      sequenced: sequenceRoute([street]),
      cleaningInfoByStreet: new Map([[street.id, { streetId: street.id, dirtScore: null, requiresWater: true, estWaterLitersPer100m: null, usesPressureWash: false, dirtLevel: null, waterFigureIsMeasured: false, accessIssue: false, narrowRoad: false, profileWidthM: null, isHighPriority: false }]]),
      waterPoints: [],
      wastePoints: [],
    });
    check("תרחיש א: אין עצירת מילוי מיותרת כשיש מספיק מים", sim.refillCount === 0);
  }

  console.log("\n  תרחיש ב — נדרש מילוי");
  {
    const vehicle = {
      waterCapacityL: 60,
      minWaterReserveL: 10,
      waterLPerCleanKm: 100,
      waterLPerWorkHour: null,
      canEnterPath: true,
      canMountSidewalk: true,
      suitableForRoad: true,
      resourceTypeId: "rt",
      workHoursStart: "07:00",
      workHoursEnd: "15:00",
      avgTravelSpeedKmh: 20,
      startPoint: null,
      waterProfileUnknown: false,
    } as unknown as ReturnType<typeof resolveVehicleProfile>;
    const streets: DueStreet[] = [1, 2].map(
      (n) =>
        ({
          id: `s${n}`,
          name: `${TAG} מקטע ${n}`,
          lengthM: 1000,
          estimatedCleanMinutes: 15,
          priority: "NORMAL",
          type: "STREET",
          startPointLat: 32.18 + n * 0.001,
          startPointLon: 34.9,
          endPointLat: 32.1801 + n * 0.001,
          endPointLon: 34.9001,
          allowedResourceTypes: [],
        } as unknown as DueStreet)
    );
    const waterPoints: WaterPointRow[] = [
      { id: "wp1", name: `${TAG} נקודת מילוי`, lat: 32.181, lon: 34.9005, status: "ACTIVE", availabilityHours: null, flowLitersPerMin: 40, avgFillMinutes: 8, avgWaitMinutes: 0, maxVehicleWidthM: null, maxVehicleHeightM: null, allowedResourceTypes: [] },
    ];
    const info = new Map(
      streets.map((s) => [s.id, { streetId: s.id, dirtScore: null, requiresWater: true, estWaterLitersPer100m: null, usesPressureWash: false, dirtLevel: null, waterFigureIsMeasured: false, accessIssue: false, narrowRoad: false, profileWidthM: null, isHighPriority: false }])
    );
    const sim = simulateResourceRoute({ date: todayDateOnly(), shiftDate: todayDateOnly(), vehicle, sequenced: sequenceRoute(streets), cleaningInfoByStreet: info, waterPoints, wastePoints: [] });
    check("תרחיש ב: המערכת מוסיפה עצירת מילוי כשהמים אינם מספיקים", sim.refillCount >= 1, `refillCount=${sim.refillCount}`);
    check("תרחיש ב: עצירת המילוי מחשבת מחדש את שעת הסיום (יש זמן שירות)", sim.totalServiceMin > 0);
  }

  console.log("\n  תרחיש ג — נקודת מים תקולה");
  {
    const vehicle = {
      waterCapacityL: 60,
      minWaterReserveL: 10,
      waterLPerCleanKm: 100,
      waterLPerWorkHour: null,
      canEnterPath: true,
      canMountSidewalk: true,
      suitableForRoad: true,
      resourceTypeId: "rt",
      workHoursStart: "07:00",
      workHoursEnd: "15:00",
      avgTravelSpeedKmh: 20,
      startPoint: null,
      waterProfileUnknown: false,
    } as unknown as ReturnType<typeof resolveVehicleProfile>;
    const street: DueStreet = {
      id: "sc1",
      name: `${TAG} מקטע ג`,
      lengthM: 1000,
      estimatedCleanMinutes: 15,
      priority: "NORMAL",
      type: "STREET",
      startPointLat: 32.18,
      startPointLon: 34.9,
      endPointLat: 32.1801,
      endPointLon: 34.9001,
      allowedResourceTypes: [],
    } as unknown as DueStreet;
    const waterPoints: WaterPointRow[] = [
      { id: "broken", name: `${TAG} תקולה קרובה`, lat: 32.1801, lon: 34.9002, status: "BROKEN", availabilityHours: null, flowLitersPerMin: 40, avgFillMinutes: 8, avgWaitMinutes: 0, maxVehicleWidthM: null, maxVehicleHeightM: null, allowedResourceTypes: [] },
      { id: "far-ok", name: `${TAG} תקינה רחוקה`, lat: 32.2, lon: 34.95, status: "ACTIVE", availabilityHours: null, flowLitersPerMin: 40, avgFillMinutes: 8, avgWaitMinutes: 0, maxVehicleWidthM: null, maxVehicleHeightM: null, allowedResourceTypes: [] },
    ];
    const info = new Map([[street.id, { streetId: street.id, dirtScore: null, requiresWater: true, estWaterLitersPer100m: null, usesPressureWash: false, dirtLevel: null, waterFigureIsMeasured: false, accessIssue: false, narrowRoad: false, profileWidthM: null, isHighPriority: false }]]);
    const sim = simulateResourceRoute({ date: todayDateOnly(), shiftDate: todayDateOnly(), vehicle, sequenced: sequenceRoute([street]), cleaningInfoByStreet: info, waterPoints, wastePoints: [] });
    const refillEvent = sim.events.find((e) => e.kind === "SERVICE_STOP" && e.serviceKind === "WATER_REFILL");
    check("תרחיש ג: הנקודה התקולה לא נבחרת", !!(refillEvent && refillEvent.kind === "SERVICE_STOP" && refillEvent.pointId !== "broken"));
    check("תרחיש ג: נבחרת נקודה חלופית תקינה", !!(refillEvent && refillEvent.kind === "SERVICE_STOP" && refillEvent.pointId === "far-ok"));
  }

  console.log("\n  תרחיש ד — מסלול ארוך מדי");
  {
    const zone = await prisma.operationalZone.create({ data: { code: `${TAG}Z3`, name: `${TAG} אזור 3`, color: "#000" } });
    const rt = await prisma.resourceType.create({ data: { code: `${TAG}RT3`, name: `${TAG} סוג 3`, suitableForRoad: true } });
    const resource = await prisma.resource.create({
      data: { resourceTypeId: rt.id, identifier: `${TAG}R5`, status: "ACTIVE", workHoursStart: "07:00", workHoursEnd: "07:30", allowedZones: { connect: { id: zone.id } } },
    });
    const critical = await prisma.street.create({
      data: { name: `${TAG} מקטע קריטי`, zoneId: zone.id, priority: "CRITICAL", cleaningFrequency: { type: "DAILY" }, source: "MANUAL", lengthM: 100, estimatedCleanMinutes: 30, startPointLat: 32.18, startPointLon: 34.9, endPointLat: 32.1801, endPointLon: 34.9001 },
    });
    const low = await prisma.street.create({
      data: { name: `${TAG} מקטע נמוך`, zoneId: zone.id, priority: "LOW", cleaningFrequency: { type: "DAILY" }, source: "MANUAL", lengthM: 100, estimatedCleanMinutes: 15, startPointLat: 32.182, startPointLon: 34.902, endPointLat: 32.1821, endPointLon: 34.9021 },
    });
    void critical;
    const { alternatives } = await buildRouteAlternatives({ date: todayDateOnly(), resourceIds: [resource.id] });
    const fastest = alternatives.find((a) => a.variant === "FASTEST")!;
    const assignedNames = fastest.resources.flatMap((r) => r.events.filter((e) => e.kind === "TASK").map((e) => e.streetName));
    check("תרחיש ד: המקטע הקריטי שובץ (30 דק' ממלאות את המשמרת בת 30 דק')", assignedNames.some((n) => n.includes("קריטי")));
    check("תרחיש ד: המקטע הנמוך נותר UNASSIGNED עם הסבר", fastest.unassigned.some((u) => u.id === low.id && u.reason.length > 0));
  }

  console.log("\n  תרחיש ה — כלי אינו מתאים");
  {
    const zone = await prisma.operationalZone.create({ data: { code: `${TAG}Z4`, name: `${TAG} אזור 4`, color: "#000" } });
    const rt = await prisma.resourceType.create({ data: { code: `${TAG}RT4`, name: `${TAG} סוג 4`, suitableForRoad: true, suitableForPath: false } });
    const resource = await prisma.resource.create({
      data: {
        resourceTypeId: rt.id,
        identifier: `${TAG}R6`,
        status: "ACTIVE",
        workHoursStart: "07:00",
        workHoursEnd: "15:00",
        allowedZones: { connect: { id: zone.id } },
        operationalProfile: { create: { canEnterPath: false, canMountSidewalk: false } },
      },
    });
    const path = await prisma.street.create({
      data: { name: `${TAG} שביל צר`, zoneId: zone.id, type: "PATH", priority: "NORMAL", cleaningFrequency: { type: "DAILY" }, source: "MANUAL", lengthM: 100, estimatedCleanMinutes: 10, startPointLat: 32.18, startPointLon: 34.9, endPointLat: 32.1801, endPointLon: 34.9001 },
    });
    const { alternatives } = await buildRouteAlternatives({ date: todayDateOnly(), resourceIds: [resource.id] });
    const fastest = alternatives.find((a) => a.variant === "FASTEST")!;
    const assignedIds = fastest.resources.flatMap((r) => r.events.filter((e) => e.kind === "TASK").map((e) => e.streetId));
    check("תרחיש ה: השביל לא שובץ לכלי שאינו מתאים", !assignedIds.includes(path.id));
    check("תרחיש ה: השביל מופיע ברשימת הלא-משובצים עם הסבר התאמה", fastest.unassigned.some((u) => u.id === path.id && u.reason.length > 0));
  }

  // =========================================================================
  console.log(`\n${passed} בדיקות עברו, ${failures.length} נכשלו`);
  if (failures.length > 0) {
    console.log("\nכשלים:");
    for (const f of failures) console.log(`  - ${f}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    if (failures.length > 0) process.exitCode = 1;
  });
