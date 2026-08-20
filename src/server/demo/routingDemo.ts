/**
 * §19 — the smart-cleaning demo dataset.
 *
 * Every row this creates carries `isDemo = true` (or, for models with no such
 * column — `StreetCleaningProfile`, `StreetSurvey` — hangs off a row that
 * does), and every name/code is prefixed `DEMO` so it can never be mistaken
 * for real data at a glance. `clearDemoRouting()` removes exactly what this
 * file created and nothing else — real streets, zones and resources are
 * matched by the same prefix/flag and are therefore untouched.
 *
 * Scenario covered, per the brief:
 *   - one zone, eight cleaning segments
 *   - a vehicle with a defined water tank capacity
 *   - two water points, one of them BROKEN
 *   - one segment that is very dirty (dirtBaseLevel 5)
 *   - one segment with a known access problem
 *   - a route that requires a refill (tank too small for the whole plan)
 */
import { prisma } from "@/lib/prisma";
import { setStreetGeometry } from "@/server/geo.service";
import { isDemoModeEnabled } from "@/lib/env";
import type { Prisma } from "@/generated/prisma/client";

const DEMO_ZONE_CODE = "DEMO-01";
const DEMO_PREFIX = "DEMO";

// Eight short, distinct segments walking roughly south along a corridor near
// the centre of Kfar Saba — close enough to the real road graph that
// nearest-node routing finds sensible neighbours, but clearly fictitious
// street names so nobody mistakes them for the genuine OSM import.
const DEMO_STREETS: {
  name: string;
  start: [number, number];
  end: [number, number];
  dirtBaseLevel: number;
  accessIssue: boolean;
  requiresWater: boolean;
}[] = [
  { name: "DEMO — רחוב הדגמה 1", start: [34.9075, 32.181], end: [34.9078, 32.1805], dirtBaseLevel: 3, accessIssue: false, requiresWater: true },
  { name: "DEMO — רחוב הדגמה 2", start: [34.9078, 32.1805], end: [34.9081, 32.18], dirtBaseLevel: 3, accessIssue: false, requiresWater: true },
  { name: "DEMO — רחוב הדגמה 3", start: [34.9081, 32.18], end: [34.9084, 32.1795], dirtBaseLevel: 5, accessIssue: false, requiresWater: true },
  { name: "DEMO — רחוב הדגמה 4", start: [34.9084, 32.1795], end: [34.9087, 32.179], dirtBaseLevel: 2, accessIssue: true, requiresWater: false },
  { name: "DEMO — שביל הדגמה 5", start: [34.9087, 32.179], end: [34.909, 32.1785], dirtBaseLevel: 3, accessIssue: false, requiresWater: true },
  { name: "DEMO — רחוב הדגמה 6", start: [34.909, 32.1785], end: [34.9093, 32.178], dirtBaseLevel: 4, accessIssue: false, requiresWater: true },
  { name: "DEMO — רחוב הדגמה 7", start: [34.9093, 32.178], end: [34.9096, 32.1775], dirtBaseLevel: 2, accessIssue: false, requiresWater: true },
  { name: "DEMO — רחוב הדגמה 8", start: [34.9096, 32.1775], end: [34.9099, 32.177], dirtBaseLevel: 3, accessIssue: false, requiresWater: true },
];

export type DemoSeedResult = { zoneId: string; streetIds: string[]; resourceId: string; waterPointIds: string[] };

export async function seedDemoRouting(adminUserId: string): Promise<DemoSeedResult> {
  if (!isDemoModeEnabled()) {
    throw new Error("DEMO_MODE אינו מופעל — יש להגדיר DEMO_MODE=true כדי לזרוע נתוני הדגמה.");
  }
  await clearDemoRouting();

  const zone = await prisma.operationalZone.create({
    data: {
      name: "DEMO — אזור הדגמה",
      code: DEMO_ZONE_CODE,
      color: "#7c3aed",
      description: "אזור הדגמה בלבד — ניתן למחיקה דרך מסך ההגדרות",
      verificationStatus: "VERIFIED",
      confidence: "HIGH",
      isDemo: true,
    },
  });

  const resourceType = await prisma.resourceType.upsert({
    where: { code: `${DEMO_PREFIX}_SWEEPER` },
    create: {
      name: "DEMO — מכונת טיאוט",
      code: `${DEMO_PREFIX}_SWEEPER`,
      category: "SWEEPER_MEDIUM",
      suitableForRoad: true,
      suitableForSidewalk: true,
      suitableForPath: true,
      capacityLiters: 800,
    },
    update: {},
  });

  const resource = await prisma.resource.create({
    data: {
      resourceTypeId: resourceType.id,
      identifier: `${DEMO_PREFIX}-001`,
      name: "DEMO — כלי הדגמה",
      status: "ACTIVE",
      workHoursStart: "07:00",
      workHoursEnd: "11:00", // short shift, deliberately: forces a refill within the demo route
      isDemo: true,
      allowedZones: { connect: { id: zone.id } },
      operationalProfile: {
        create: {
          // Small tank on purpose: eight segments needing water will not fit
          // in one tank, so the demo route genuinely requires a mid-route
          // refill — this is what makes the "requires a refill" comparison real.
          waterCapacityL: 200,
          minWaterReserveL: 30,
          waterLPerCleanKm: 40,
          waterLPerWorkHour: 25,
          wasteCapacityKg: 500,
          widthM: 1.6,
          canEnterPath: true,
          canMountSidewalk: true,
          avgWorkSpeedMPerMin: 60,
          avgTravelSpeedKmh: 18,
          avgFillMinutes: 10,
          verificationStatus: "VERIFIED",
          confidence: "HIGH",
        },
      },
    },
  });

  const waterActive = await prisma.waterRefillPoint.create({
    data: {
      name: "DEMO — ברז הדגמה תקין",
      lat: 32.179,
      lon: 34.9085,
      zoneId: zone.id,
      status: "ACTIVE",
      verificationStatus: "VERIFIED",
      confidence: "HIGH",
      flowLitersPerMin: 40,
      avgFillMinutes: 8,
      avgWaitMinutes: 2,
      parallelCapacity: 1,
      isDemo: true,
    },
  });
  const waterBroken = await prisma.waterRefillPoint.create({
    data: {
      name: "DEMO — ברז הדגמה תקול",
      lat: 32.1798,
      lon: 34.908,
      zoneId: zone.id,
      status: "BROKEN",
      verificationStatus: "VERIFIED",
      confidence: "HIGH",
      notes: "מסומן תקול בכוונה, להדגמת תרחיש ג (§21)",
      isDemo: true,
    },
  });

  const wastePoint = await prisma.wasteDisposalPoint.create({
    data: {
      name: "DEMO — נקודת פריקה",
      lat: 32.1775,
      lon: 34.9098,
      zoneId: zone.id,
      status: "ACTIVE",
      verificationStatus: "VERIFIED",
      avgDumpMinutes: 10,
      isDemo: true,
    },
  });
  void wastePoint;

  const streetIds: string[] = [];
  for (const s of DEMO_STREETS) {
    const street = await prisma.street.create({
      data: {
        name: s.name,
        type: s.name.includes("שביל") ? "PATH" : "STREET",
        zoneId: zone.id,
        priority: s.dirtBaseLevel >= 4 ? "HIGH" : "NORMAL",
        cleaningFrequency: { type: "DAILY" } as unknown as Prisma.InputJsonValue,
        source: "MANUAL",
        isDemo: true,
      },
    });
    await setStreetGeometry(street.id, [s.start, s.end]);

    await prisma.streetCleaningProfile.create({
      data: {
        streetId: street.id,
        dirtBaseLevel: s.dirtBaseLevel,
        plannedCleanMin: 15,
        requiresWater: s.requiresWater,
        estWaterLitersPer100m: s.requiresWater ? 35 : null,
        accessIssue: s.accessIssue,
        pedestrianTraffic: 3,
        dataMode: "MANUAL_BASELINE",
        confidence: "MEDIUM",
        supervisorNote: "פרופיל הדגמה",
      },
    });

    await prisma.streetSurvey.create({
      data: {
        streetId: street.id,
        surveyedById: adminUserId,
        answers: {
          dirtLevel: s.dirtBaseLevel,
          timesPerWeek: 7,
          estimatedCleanMinutes: 15,
          suitableResourceTypeIds: [resourceType.id],
          hasAccessProblem: s.accessIssue,
          isNarrowRoad: false,
          requiresWater: s.requiresWater,
        } as unknown as Prisma.InputJsonValue,
        progress: "COMPLETED",
      },
    });

    streetIds.push(street.id);
  }

  return { zoneId: zone.id, streetIds, resourceId: resource.id, waterPointIds: [waterActive.id, waterBroken.id] };
}

/** Deletes every row this file's seed creates, in FK-safe order. Real data is never touched. */
export async function clearDemoRouting(): Promise<void> {
  const streets = await prisma.street.findMany({ where: { isDemo: true }, select: { id: true } });
  const streetIds = streets.map((s) => s.id);

  await prisma.streetSurvey.deleteMany({ where: { streetId: { in: streetIds } } });
  await prisma.workPlanServiceStop.deleteMany({
    where: {
      OR: [
        { waterRefillPoint: { isDemo: true } },
        { wasteDisposalPoint: { isDemo: true } },
        { resource: { isDemo: true } },
      ],
    },
  });
  await prisma.taskFieldReport.deleteMany({ where: { workPlanTask: { street: { isDemo: true } } } });
  await prisma.workPlanTask.deleteMany({ where: { OR: [{ streetId: { in: streetIds } }, { resource: { isDemo: true } }] } });
  await prisma.shiftReport.deleteMany({ where: { resource: { isDemo: true } } });
  await prisma.streetCleaningProfile.deleteMany({ where: { streetId: { in: streetIds } } });
  await prisma.street.deleteMany({ where: { isDemo: true } });
  await prisma.waterRefillPoint.deleteMany({ where: { isDemo: true } });
  await prisma.wasteDisposalPoint.deleteMany({ where: { isDemo: true } });
  await prisma.resourceOperationalProfile.deleteMany({ where: { resource: { isDemo: true } } });
  await prisma.resource.deleteMany({ where: { isDemo: true } });
  await prisma.resourceType.deleteMany({ where: { code: { startsWith: DEMO_PREFIX } } });
  await prisma.operationalZone.deleteMany({ where: { isDemo: true } });
}
