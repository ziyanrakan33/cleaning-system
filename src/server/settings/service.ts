/**
 * Operator-editable configuration, stored in the database.
 *
 * §2 and §11 both require a manager to be able to change the numbers that
 * drive a recommendation from a screen. A weight nobody can change without a
 * redeploy is not a weight, it is a hardcoded opinion — so these live in
 * `system_settings`, not in the environment, and every change is audited.
 *
 * Reads fall back to the documented default rather than throwing, so a fresh
 * database produces the same behaviour as a configured one and the very first
 * plan generation does not depend on someone having visited /settings first.
 */
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import type { Prisma } from "@/generated/prisma/client";

export const SETTING_KEYS = {
  dirtScoreWeights: "dirtScore.weights",
  dirtScoreThresholds: "dirtScore.thresholds",
  routeCostWeights: "routing.costWeights",
  organization: "organization.branding",
} as const;

// ---------------------------------------------------------------------------
// Organization branding (§11) — kept out of code so the app is not hardcoded
// to one municipality. A single row: this system serves one organization at
// a time, not a multi-tenant rewrite.
// ---------------------------------------------------------------------------

export type OrganizationSettings = {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  timezone: string;
  language: string;
  dateFormat: string;
  /** Shown on the readiness dashboard as "X out of N zones assigned" — not a hard limit. */
  targetZoneCount: number;
};

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  name: "העירייה",
  logoUrl: null,
  primaryColor: null,
  timezone: "Asia/Jerusalem",
  language: "he",
  dateFormat: "DD/MM/YYYY",
  targetZoneCount: 10,
};

// ---------------------------------------------------------------------------
// Dirt score weights (§2)
// ---------------------------------------------------------------------------

export type DirtScoreWeights = {
  historicalDirt: number;
  timeSinceLastClean: number;
  openComplaints: number;
  pedestrianTraffic: number;
  proximity: number;
  seasonalAndEvents: number;
  supervisorEstimate: number;
};

/** The percentages named in the specification. They sum to 100. */
export const DEFAULT_DIRT_SCORE_WEIGHTS: DirtScoreWeights = {
  historicalDirt: 25,
  timeSinceLastClean: 20,
  openComplaints: 15,
  pedestrianTraffic: 10,
  proximity: 10,
  seasonalAndEvents: 10,
  supervisorEstimate: 10,
};

export type DirtScoreThresholds = {
  /** Completed field reports on one street before it may reach DATA_INFORMED. */
  dataInformedMinSamples: number;
  /** Beyond this many days, a profile's measured figures are treated as stale. */
  staleAfterDays: number;
  /** Complaints counted at full weight; more than this does not raise the score further. */
  complaintSaturation: number;
};

export const DEFAULT_DIRT_SCORE_THRESHOLDS: DirtScoreThresholds = {
  dataInformedMinSamples: 10,
  staleAfterDays: 120,
  complaintSaturation: 5,
};

// ---------------------------------------------------------------------------
// Route cost weights (§11)
// ---------------------------------------------------------------------------

/**
 * Cost per unit, in abstract points. Only ratios matter — a route's absolute
 * score is meaningless on its own and is never shown without the breakdown
 * that produced it.
 */
export type RouteCostWeights = {
  /** per minute driving between jobs */
  travelMinute: number;
  /** per kilometre driven without cleaning */
  deadKilometre: number;
  /** per minute actually cleaning */
  cleanMinute: number;
  /** per minute at a water point (travel there is charged separately) */
  refillMinute: number;
  /** per minute at a disposal point */
  disposalMinute: number;
  /** per minute the route runs past the end of the shift */
  overtimeMinute: number;
  /** per due street left out of the plan entirely */
  unassignedSegment: number;
  /** extra, on top of the above, when the skipped street scored as high priority */
  skippedHighPriority: number;
  /** per kilometre of detour to reach a water point */
  distantWaterPoint: number;
  /** per street served by a vehicle that does not suit it */
  unsuitableVehicle: number;
  /** per litre the plan dips below the vehicle's minimum water reserve */
  belowWaterReserve: number;
  /** per repeat visit to a street already cleaned in the same route */
  redundantRevisit: number;
};

export const DEFAULT_ROUTE_COST_WEIGHTS: RouteCostWeights = {
  travelMinute: 1,
  deadKilometre: 2,
  cleanMinute: 0.2,
  refillMinute: 1.5,
  disposalMinute: 1.5,
  overtimeMinute: 8,
  unassignedSegment: 40,
  skippedHighPriority: 80,
  distantWaterPoint: 3,
  unsuitableVehicle: 150,
  belowWaterReserve: 0.5,
  redundantRevisit: 60,
};

// ---------------------------------------------------------------------------

/**
 * Reads a setting, merging stored values over the defaults so that adding a
 * new weight in code does not require every existing installation to re-save
 * its settings row.
 */
export async function getSetting<T extends object>(key: string, fallback: T): Promise<T> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    if (!row || typeof row.value !== "object" || row.value === null || Array.isArray(row.value)) {
      return fallback;
    }
    return { ...fallback, ...(row.value as Partial<T>) };
  } catch {
    return fallback;
  }
}

export async function setSetting(
  key: string,
  value: Prisma.InputJsonValue,
  userId: string | null,
  description?: string
): Promise<void> {
  const before = await prisma.systemSetting.findUnique({ where: { key } });

  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, description, updatedById: userId },
    update: { value, description, updatedById: userId },
  });

  await audit({
    entityType: "SystemSetting",
    entityId: key,
    action: before ? "SETTING_UPDATED" : "SETTING_CREATED",
    userId,
    before: (before?.value ?? undefined) as Prisma.InputJsonValue | undefined,
    after: value,
    description: `הגדרה "${key}" עודכנה`,
  });
}

export const getDirtScoreWeights = () =>
  getSetting(SETTING_KEYS.dirtScoreWeights, DEFAULT_DIRT_SCORE_WEIGHTS);

export const getDirtScoreThresholds = () =>
  getSetting(SETTING_KEYS.dirtScoreThresholds, DEFAULT_DIRT_SCORE_THRESHOLDS);

export const getRouteCostWeights = () =>
  getSetting(SETTING_KEYS.routeCostWeights, DEFAULT_ROUTE_COST_WEIGHTS);

export const getOrganizationSettings = () =>
  getSetting(SETTING_KEYS.organization, DEFAULT_ORGANIZATION_SETTINGS);

/** True when the stored weights have been edited away from the shipped defaults. */
export function isCustomised<T extends object>(current: T, defaults: T): boolean {
  return (Object.keys(defaults) as (keyof T)[]).some((k) => current[k] !== defaults[k]);
}
