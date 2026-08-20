/**
 * §12 — builds up to three route alternatives for one date, sharing a single
 * fetch of due streets, resources, cleaning profiles and service points so
 * offering three options costs three simulations, not three round-trips to
 * the database.
 */
import { prisma } from "@/lib/prisma";
import { getDueStreets } from "@/server/scheduling/dueStreets";
import { resolveVehicleProfile } from "@/server/resources/operationalProfile";
import { getRouteCostWeights } from "@/server/settings/service";
import { ruleBasedProvider } from "./ruleBasedProvider";
import type { RoutePlanInput, RoutePlanResult, RoutePlanVariant } from "./provider";
import type { StreetCleaningInfo } from "./simulate";
import type { EligibleResource } from "@/server/scheduling/workloadBalancing";

const ALL_VARIANTS: RoutePlanVariant[] = ["FASTEST", "DIRT_PRIORITY", "WATER_SAVING"];

export type BuildAlternativesParams = {
  date: Date;
  /** Restrict to resources allowed in these zones; empty = every eligible resource. */
  zoneIds?: string[];
  /** Restrict to specific resources (e.g. one the manager picked in the wizard). */
  resourceIds?: string[];
};

async function loadSharedInputs(params: BuildAlternativesParams) {
  const dueStreets = await getDueStreets(params.date);
  const streetIds = dueStreets.map((s) => s.id);

  const resourcesRaw = await prisma.resource.findMany({
    where: {
      active: true,
      status: "ACTIVE",
      ...(params.resourceIds && params.resourceIds.length > 0 ? { id: { in: params.resourceIds } } : {}),
    },
    include: {
      resourceType: true,
      operationalProfile: true,
      allowedZones: { select: { id: true } },
      allowedStreets: { select: { id: true } },
    },
  });

  const availability = await prisma.resourceAvailability.findMany({ where: { date: params.date } });
  const unavailableIds = new Set(availability.filter((a) => a.status !== "AVAILABLE").map((a) => a.resourceId));

  const availableResources = resourcesRaw.filter(
    (r) => !unavailableIds.has(r.id) && r.workHoursStart && r.workHoursEnd
  );

  const eligibleResources: (EligibleResource & { vehicle: ReturnType<typeof resolveVehicleProfile> })[] =
    availableResources.map((r) => ({
      id: r.id,
      resourceTypeId: r.resourceTypeId,
      allowedZoneIds: r.allowedZones.map((z) => z.id),
      allowedStreetIds: r.allowedStreets.map((s) => s.id),
      workHoursStart: r.workHoursStart!,
      workHoursEnd: r.workHoursEnd!,
      vehicle: resolveVehicleProfile(r),
    }));

  const profiles = await prisma.streetCleaningProfile.findMany({ where: { streetId: { in: streetIds } } });
  const cleaningInfoByStreet = new Map<string, StreetCleaningInfo>();
  const highPrioritySet = new Set(dueStreets.filter((s) => s.priority === "CRITICAL" || s.priority === "HIGH").map((s) => s.id));
  for (const p of profiles) {
    cleaningInfoByStreet.set(p.streetId, {
      streetId: p.streetId,
      dirtScore: p.dirtScore,
      requiresWater: p.requiresWater,
      estWaterLitersPer100m: p.estWaterLitersPer100m,
      usesPressureWash: p.usesPressureWash,
      dirtLevel: p.dirtDynamicLevel ?? p.dirtBaseLevel,
      waterFigureIsMeasured: p.dataMode === "DATA_INFORMED" && p.estWaterLitersPer100m !== null,
      accessIssue: p.accessIssue,
      narrowRoad: p.narrowRoad,
      profileWidthM: p.widthM,
      isHighPriority: highPrioritySet.has(p.streetId),
    });
  }

  const [waterPoints, wastePoints, costWeights] = await Promise.all([
    prisma.waterRefillPoint.findMany({
      where: { active: true, isDemo: false },
      include: { allowedResourceTypes: { select: { id: true } } },
    }),
    prisma.wasteDisposalPoint.findMany({
      where: { active: true, isDemo: false },
      include: { allowedResourceTypes: { select: { id: true } } },
    }),
    getRouteCostWeights(),
  ]);

  return { dueStreets, eligibleResources, cleaningInfoByStreet, waterPoints, wastePoints, costWeights };
}

export async function buildRouteAlternatives(params: BuildAlternativesParams): Promise<{
  alternatives: RoutePlanResult[];
  totalDueStreets: number;
  resourceCount: number;
}> {
  const shared = await loadSharedInputs(params);

  const alternatives: RoutePlanResult[] = [];
  for (const variant of ALL_VARIANTS) {
    const input: RoutePlanInput = { date: params.date, variant, ...shared };
    alternatives.push(await ruleBasedProvider.plan(input));
  }

  return {
    alternatives,
    totalDueStreets: shared.dueStreets.length,
    resourceCount: shared.eligibleResources.length,
  };
}

/** Builds a single named variant — used when the manager has already chosen one and wants to publish it. */
export async function buildSingleRoutePlan(
  params: BuildAlternativesParams & { variant: RoutePlanVariant }
): Promise<RoutePlanResult> {
  const shared = await loadSharedInputs(params);
  return ruleBasedProvider.plan({ date: params.date, variant: params.variant, ...shared });
}
