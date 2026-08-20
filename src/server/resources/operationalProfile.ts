/**
 * §6 — the operational picture of one vehicle, resolved from three sources in
 * a fixed order of trust:
 *
 *   1. `ResourceOperationalProfile` — entered for this specific vehicle.
 *   2. `ResourceType` catalog defaults — true of the model, not the unit.
 *   3. `Resource.attributes` — the older free-form JSON, kept working.
 *
 * Anything none of the three supplies stays `null` and is reported in
 * `missingFields`. The brief is explicit on this: *if a value is unknown, mark
 * it REQUIRES_REVIEW; do not invent one and present it as real.* Everything
 * downstream — the water projection, the feasibility check, the vehicle-fit
 * test — is written to degrade when a field is null rather than to substitute
 * a plausible number.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type ResolvedVehicleProfile = {
  resourceId: string;
  identifier: string;
  name: string | null;
  resourceTypeId: string;
  resourceTypeName: string;

  waterCapacityL: number | null;
  wasteCapacityKg: number | null;
  minWaterReserveL: number | null;
  waterLPerWorkHour: number | null;
  waterLPerCleanKm: number | null;
  wasteKgPerCleanKm: number | null;

  widthM: number | null;
  heightM: number | null;
  weightKg: number | null;
  canEnterPath: boolean;
  canMountSidewalk: boolean;
  suitableForRoad: boolean;

  avgWorkSpeedMPerMin: number | null;
  avgTravelSpeedKmh: number | null;
  avgFillMinutes: number | null;
  avgDumpMinutes: number | null;

  startPoint: [number, number] | null;
  endPoint: [number, number] | null;

  workHoursStart: string | null;
  workHoursEnd: string | null;

  /** Field names with no value from any source, in Hebrew, for the UI. */
  missingFields: { field: string; label: string }[];
  /** True when nothing about water is known, so no projection may be shown. */
  waterProfileUnknown: boolean;
  hasProfileRow: boolean;
};

export const VEHICLE_FIELD_LABELS: Record<string, string> = {
  waterCapacityL: "קיבולת מיכל מים",
  wasteCapacityKg: "קיבולת פסולת",
  minWaterReserveL: "רזרבת מים מינימלית",
  waterLPerWorkHour: "צריכת מים לשעת עבודה",
  waterLPerCleanKm: 'צריכת מים לק"מ ניקיון',
  wasteKgPerCleanKm: 'צבירת פסולת לק"מ',
  widthM: "רוחב הכלי",
  heightM: "גובה הכלי",
  weightKg: "משקל",
  avgWorkSpeedMPerMin: "מהירות עבודה ממוצעת",
  avgTravelSpeedKmh: "מהירות נסיעה ממוצעת",
  avgFillMinutes: "זמן מילוי ממוצע",
  avgDumpMinutes: "זמן פריקה ממוצע",
  startPoint: "נקודת יציאה",
  endPoint: "נקודת חזרה",
  workHours: "שעות משמרת",
};

/** Reads a number out of the legacy free-form `attributes` JSON. */
function fromAttributes(attributes: Prisma.JsonValue, key: string): number | null {
  if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) return null;
  const raw = (attributes as Record<string, unknown>)[key];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type ResourceWithProfile = Prisma.ResourceGetPayload<{
  include: { resourceType: true; operationalProfile: true };
}>;

export function resolveVehicleProfile(resource: ResourceWithProfile): ResolvedVehicleProfile {
  const p = resource.operationalProfile;
  const rt = resource.resourceType;
  const attrs = resource.attributes;

  const waterCapacityL = p?.waterCapacityL ?? rt.capacityLiters ?? fromAttributes(attrs, "waterCapacityL");
  const avgTravelSpeedKmh = p?.avgTravelSpeedKmh ?? fromAttributes(attrs, "travelSpeedKmh");

  const resolved = {
    waterCapacityL,
    wasteCapacityKg: p?.wasteCapacityKg ?? fromAttributes(attrs, "wasteCapacityKg"),
    minWaterReserveL: p?.minWaterReserveL ?? null,
    waterLPerWorkHour: p?.waterLPerWorkHour ?? null,
    waterLPerCleanKm: p?.waterLPerCleanKm ?? null,
    wasteKgPerCleanKm: p?.wasteKgPerCleanKm ?? null,
    widthM: p?.widthM ?? null,
    heightM: p?.heightM ?? null,
    weightKg: p?.weightKg ?? null,
    avgWorkSpeedMPerMin: p?.avgWorkSpeedMPerMin ?? fromAttributes(attrs, "workSpeedMPerMin"),
    avgTravelSpeedKmh,
    avgFillMinutes: p?.avgFillMinutes ?? null,
    avgDumpMinutes: p?.avgDumpMinutes ?? null,
  };

  const startPoint: [number, number] | null =
    p?.startPointLon != null && p?.startPointLat != null ? [p.startPointLon, p.startPointLat] : null;
  const endPoint: [number, number] | null =
    p?.endPointLon != null && p?.endPointLat != null ? [p.endPointLon, p.endPointLat] : null;

  const missingFields: { field: string; label: string }[] = [];
  for (const [field, value] of Object.entries(resolved)) {
    if (value === null) missingFields.push({ field, label: VEHICLE_FIELD_LABELS[field] ?? field });
  }
  if (!startPoint) missingFields.push({ field: "startPoint", label: VEHICLE_FIELD_LABELS.startPoint });
  if (!endPoint) missingFields.push({ field: "endPoint", label: VEHICLE_FIELD_LABELS.endPoint });
  if (!resource.workHoursStart || !resource.workHoursEnd) {
    missingFields.push({ field: "workHours", label: VEHICLE_FIELD_LABELS.workHours });
  }

  return {
    resourceId: resource.id,
    identifier: resource.identifier,
    name: resource.name,
    resourceTypeId: resource.resourceTypeId,
    resourceTypeName: rt.name,
    ...resolved,
    // Suitability falls back to the type catalog, which every resource type
    // already carries — these are the one group of fields that genuinely do
    // have a trustworthy default.
    canEnterPath: p?.canEnterPath ?? rt.suitableForPath,
    canMountSidewalk: p?.canMountSidewalk ?? rt.suitableForSidewalk,
    suitableForRoad: rt.suitableForRoad,
    startPoint,
    endPoint,
    workHoursStart: resource.workHoursStart,
    workHoursEnd: resource.workHoursEnd,
    missingFields,
    // Without a tank size and at least one consumption rate there is nothing to
    // project — the plan must say "no water data" rather than draw a curve.
    waterProfileUnknown:
      resolved.waterCapacityL === null ||
      (resolved.waterLPerCleanKm === null && resolved.waterLPerWorkHour === null),
    hasProfileRow: !!p,
  };
}

export async function getVehicleProfile(resourceId: string): Promise<ResolvedVehicleProfile | null> {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    include: { resourceType: true, operationalProfile: true },
  });
  return resource ? resolveVehicleProfile(resource) : null;
}

export async function getVehicleProfiles(resourceIds: string[]): Promise<Map<string, ResolvedVehicleProfile>> {
  const resources = await prisma.resource.findMany({
    where: { id: { in: resourceIds } },
    include: { resourceType: true, operationalProfile: true },
  });
  return new Map(resources.map((r) => [r.id, resolveVehicleProfile(r)]));
}

/**
 * Whether a vehicle may work a given street.
 *
 * Returns a reason rather than a bare boolean, because §12 and §13 both have to
 * tell the manager *why* a street was dropped from a route or why the engine
 * suggested a different vehicle.
 */
export function checkVehicleFitsStreet(
  vehicle: ResolvedVehicleProfile,
  street: {
    type: string;
    allowedResourceTypeIds: string[];
    profileWidthM: number | null;
    narrowRoad: boolean;
  }
): { fits: true } | { fits: false; reason: string } {
  if (street.allowedResourceTypeIds.length > 0 && !street.allowedResourceTypeIds.includes(vehicle.resourceTypeId)) {
    return { fits: false, reason: `סוג הכלי "${vehicle.resourceTypeName}" אינו ברשימת הכלים המורשים למקטע` };
  }

  switch (street.type) {
    case "PATH":
      if (!vehicle.canEnterPath) return { fits: false, reason: "הכלי אינו יכול להיכנס לשבילים" };
      break;
    case "PEDESTRIAN_MALL":
      if (!vehicle.canEnterPath && !vehicle.canMountSidewalk) {
        return { fits: false, reason: "הכלי אינו מתאים למדרחוב" };
      }
      break;
    case "STREET":
      if (!vehicle.suitableForRoad) return { fits: false, reason: "הכלי אינו מתאים לעבודה על כביש" };
      break;
  }

  // Width is only decisive when both numbers are known. An unknown street width
  // must not silently disqualify a vehicle, nor silently admit it.
  if (street.profileWidthM !== null && vehicle.widthM !== null && vehicle.widthM > street.profileWidthM) {
    return {
      fits: false,
      reason: `רוחב הכלי ${vehicle.widthM} מ׳ גדול מרוחב המקטע ${street.profileWidthM} מ׳`,
    };
  }
  if (street.narrowRoad && vehicle.widthM !== null && vehicle.widthM > 2.2) {
    return { fits: false, reason: `המקטע סומן כדרך צרה והכלי רחב (${vehicle.widthM} מ׳)` };
  }

  return { fits: true };
}
