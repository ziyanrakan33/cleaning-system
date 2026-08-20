/**
 * §9 — projected water use along a route.
 *
 * Pure functions, no database. Given a vehicle profile and an ordered list of
 * segments, produces the litres-remaining curve, the point at which the tank
 * is expected to fall below its reserve, and whether any of that rests on
 * measured history (`MEASURED`) or on the operator's estimate (`ESTIMATED`).
 *
 * When the vehicle has no water profile the answer is "no projection", not a
 * projection built from defaults. A fabricated water curve would drive the
 * router to insert refill stops the crew does not need, or worse, to omit ones
 * they do.
 */
import type { CalcBasis } from "@/generated/prisma/enums";
import type { ResolvedVehicleProfile } from "@/server/resources/operationalProfile";

export type WaterSegmentInput = {
  streetId: string;
  streetName: string;
  lengthM: number | null;
  cleanMinutes: number;
  /** From the cleaning profile; null when unsurveyed. */
  requiresWater: boolean;
  estWaterLitersPer100m: number | null;
  usesPressureWash: boolean;
  /** 1–5. Dirtier streets get washed harder. */
  dirtLevel: number | null;
  /** True when `estWaterLitersPer100m` came from completed field reports. */
  waterFigureIsMeasured: boolean;
};

export type WaterSegmentProjection = {
  streetId: string;
  streetName: string;
  litersBefore: number;
  litersUsed: number;
  litersAfter: number;
  /** True when this is the segment that takes the tank under its reserve. */
  crossesReserve: boolean;
  basis: CalcBasis;
};

export type WaterProjection = {
  available: boolean;
  /** Why no projection could be made, when `available` is false. */
  unavailableReason: string | null;
  capacityL: number | null;
  reserveL: number;
  startLiters: number | null;
  segments: WaterSegmentProjection[];
  totalLitersUsed: number;
  /** Index into `segments` of the first one to go under reserve; -1 if none. */
  firstBelowReserveIndex: number;
  /** ESTIMATED unless every segment's figure came from measurement. */
  basis: CalcBasis;
};

/**
 * Pressure washing roughly doubles consumption, and a filthy street gets a
 * heavier pass than a clean one. Both are coarse operator rules of thumb, not
 * measurements — they are applied to an already-estimated litre figure and
 * never used to manufacture one from nothing.
 */
const PRESSURE_WASH_MULTIPLIER = 2;

function dirtMultiplier(dirtLevel: number | null): number {
  if (dirtLevel === null) return 1;
  // 1 → 0.8, 3 → 1.0, 5 → 1.2
  return 0.8 + ((dirtLevel - 1) / 4) * 0.4;
}

/**
 * Litres one segment is expected to consume.
 *
 * Takes the *larger* of the length-based and time-based figures rather than
 * adding them: they are two ways of measuring the same water, and a slow pass
 * over a short street is limited by time while a fast pass over a long one is
 * limited by distance.
 */
export function segmentWaterLiters(
  segment: WaterSegmentInput,
  vehicle: Pick<ResolvedVehicleProfile, "waterLPerCleanKm" | "waterLPerWorkHour">
): number {
  if (!segment.requiresWater) return 0;

  const perStreetFigure =
    segment.estWaterLitersPer100m !== null && segment.lengthM !== null
      ? (segment.lengthM / 100) * segment.estWaterLitersPer100m
      : null;

  const byDistance =
    vehicle.waterLPerCleanKm !== null && segment.lengthM !== null
      ? (segment.lengthM / 1000) * vehicle.waterLPerCleanKm
      : null;

  const byTime =
    vehicle.waterLPerWorkHour !== null ? (segment.cleanMinutes / 60) * vehicle.waterLPerWorkHour : null;

  // The street's own measured figure wins when it exists — it already accounts
  // for how this particular street behaves.
  const base = perStreetFigure ?? (Math.max(byDistance ?? 0, byTime ?? 0) || byDistance || byTime || 0);

  const multiplier = dirtMultiplier(segment.dirtLevel) * (segment.usesPressureWash ? PRESSURE_WASH_MULTIPLIER : 1);
  return Math.round(base * multiplier * 10) / 10;
}

export function projectWaterUsage(params: {
  vehicle: ResolvedVehicleProfile;
  segments: WaterSegmentInput[];
  /** Litres in the tank at the start; from the shift report when one exists. */
  startLiters?: number | null;
}): WaterProjection {
  const { vehicle, segments } = params;

  if (vehicle.waterProfileUnknown) {
    return {
      available: false,
      unavailableReason: vehicle.waterCapacityL === null
        ? "לא הוגדרה קיבולת מיכל המים לכלי — יש להשלים בפרופיל התפעולי"
        : "לא הוגדרה צריכת מים לכלי (לשעה או לק״מ) — יש להשלים בפרופיל התפעולי",
      capacityL: vehicle.waterCapacityL,
      reserveL: vehicle.minWaterReserveL ?? 0,
      startLiters: null,
      segments: [],
      totalLitersUsed: 0,
      firstBelowReserveIndex: -1,
      basis: "ESTIMATED",
    };
  }

  const capacityL = vehicle.waterCapacityL!;
  const reserveL = vehicle.minWaterReserveL ?? 0;
  const startLiters = params.startLiters ?? capacityL;

  let remaining = startLiters;
  let firstBelowReserveIndex = -1;
  let allMeasured = segments.length > 0;

  const projected: WaterSegmentProjection[] = segments.map((s, i) => {
    const used = Math.min(segmentWaterLiters(s, vehicle), Math.max(0, remaining));
    const before = remaining;
    remaining = Math.max(0, remaining - used);

    const crossesReserve = before > reserveL && remaining <= reserveL;
    if (crossesReserve && firstBelowReserveIndex === -1) firstBelowReserveIndex = i;
    if (!s.waterFigureIsMeasured) allMeasured = false;

    return {
      streetId: s.streetId,
      streetName: s.streetName,
      litersBefore: Math.round(before * 10) / 10,
      litersUsed: Math.round(used * 10) / 10,
      litersAfter: Math.round(remaining * 10) / 10,
      crossesReserve,
      basis: s.waterFigureIsMeasured ? "MEASURED" : "ESTIMATED",
    };
  });

  return {
    available: true,
    unavailableReason: null,
    capacityL,
    reserveL,
    startLiters,
    segments: projected,
    totalLitersUsed: Math.round(projected.reduce((sum, p) => sum + p.litersUsed, 0) * 10) / 10,
    firstBelowReserveIndex,
    basis: allMeasured ? "MEASURED" : "ESTIMATED",
  };
}

/** Minutes to fill `liters` at a point's flow rate, falling back to its average. */
export function fillMinutesFor(
  liters: number,
  flowLitersPerMin: number | null,
  avgFillMinutes: number | null
): number {
  if (flowLitersPerMin && flowLitersPerMin > 0) return Math.round((liters / flowLitersPerMin) * 10) / 10;
  return avgFillMinutes ?? 12;
}
