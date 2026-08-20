/**
 * Walks one resource's sequenced streets with a clock, a water tank and a
 * waste tank, inserting a refill or disposal stop exactly when the tank is
 * projected to cross its limit — never earlier "just in case", never later.
 *
 * This is the piece that turns a bare street order (routeSequencing.ts) into
 * something a crew could actually follow: every stop has a real planned time,
 * and every inserted service stop carries the reason it was inserted, which
 * is what §21 scenario ב/ג require the plan to be able to show.
 */
import { roadNetworkRouting, type LonLat } from "@/server/routing/graph";
import { travelMinutes, defaultCleanMinutes } from "@/server/scheduling/estimate";
import type { DueStreet } from "@/server/scheduling/dueStreets";
import type { SequencedStop } from "@/server/scheduling/routeSequencing";
import type { ResolvedVehicleProfile } from "@/server/resources/operationalProfile";
import {
  rankWaterPointsSync,
  rankWastePointsSync,
  type WaterPointRow,
  type WastePointRow,
} from "@/server/servicePoints/service";
import { segmentWaterLiters, fillMinutesFor } from "./water";
import { dayCodeOf } from "@/server/dateUtils";
import type { RouteCostInputs } from "./cost";
import { ZERO_COST_INPUTS } from "./cost";

export type StreetCleaningInfo = {
  streetId: string;
  dirtScore: number | null;
  requiresWater: boolean;
  estWaterLitersPer100m: number | null;
  usesPressureWash: boolean;
  dirtLevel: number | null;
  waterFigureIsMeasured: boolean;
  accessIssue: boolean;
  narrowRoad: boolean;
  profileWidthM: number | null;
  isHighPriority: boolean;
};

export type RouteEvent =
  | {
      kind: "TASK";
      streetId: string;
      streetName: string;
      sequenceOrder: number;
      plannedStart: Date;
      plannedEnd: Date;
      distanceFromPrevM: number;
      distanceBasis: "ROAD_NETWORK" | "STRAIGHT_LINE" | null;
      travelTimeMin: number;
      cleanTimeMin: number;
      waterLitersUsed: number;
      waterLitersAfter: number | null;
      waterBasis: "ESTIMATED" | "MEASURED" | null;
      /// kg this task adds to the waste tank, and the headroom left afterward
      /// (capacity minus accumulated). Both null when the vehicle has no
      /// waste capacity/rate defined — no projection is better than a made-up one.
      wasteKgUsed: number;
      wasteKgAfter: number | null;
    }
  | {
      kind: "SERVICE_STOP";
      serviceKind: "WATER_REFILL" | "WASTE_DISPOSAL";
      sequenceOrder: number;
      pointId: string;
      pointName: string;
      plannedArrival: Date;
      plannedDeparture: Date;
      travelDistanceM: number;
      travelTimeMin: number;
      serviceTimeMin: number;
      litersLoaded: number | null;
      reason: string;
      basis: "ESTIMATED" | "MEASURED";
    };

export type SimulateResult = {
  events: RouteEvent[];
  finishAt: Date;
  overCapacity: boolean;
  totalCleanMin: number;
  totalTravelMin: number;
  totalServiceMin: number;
  totalWaterUsedL: number;
  refillCount: number;
  dumpCount: number;
  costInputs: RouteCostInputs;
  /** Streets that could not run because the vehicle does not fit them. */
  droppedForVehicleFit: { streetId: string; streetName: string; reason: string }[];
};

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + Math.round(minutes) * 60000);
}

const WASTE_RESERVE_FRACTION = 0.1; // dispose once within 10% of capacity remaining

export function simulateResourceRoute(params: {
  date: Date;
  shiftDate: Date;
  vehicle: ResolvedVehicleProfile;
  sequenced: SequencedStop[];
  cleaningInfoByStreet: Map<string, StreetCleaningInfo>;
  waterPoints: WaterPointRow[];
  wastePoints: WastePointRow[];
  /** Litres in the tank at shift start; falls back to full capacity. */
  startWaterLiters?: number | null;
}): SimulateResult {
  const { vehicle, sequenced, cleaningInfoByStreet, waterPoints, wastePoints } = params;

  const events: RouteEvent[] = [];
  const droppedForVehicleFit: SimulateResult["droppedForVehicleFit"] = [];
  const costInputs: RouteCostInputs = { ...ZERO_COST_INPUTS };

  const dayCode = dayCodeOf(params.date);
  let sequenceOrder = 0;

  const shiftStartMin = vehicle.workHoursStart ? hhmmToMinutes(vehicle.workHoursStart) : 7 * 60;
  const shiftEndMin = vehicle.workHoursEnd ? hhmmToMinutes(vehicle.workHoursEnd) : 15 * 60;
  let cursor = new Date(params.shiftDate);
  cursor.setHours(0, 0, 0, 0);
  cursor = addMinutes(cursor, shiftStartMin);

  let waterRemaining = params.startWaterLiters ?? vehicle.waterCapacityL ?? Infinity;
  const wasteCapacity = vehicle.wasteCapacityKg ?? Infinity;
  let wasteAccumulated = 0;
  const reserveL = vehicle.minWaterReserveL ?? 0;

  let totalCleanMin = 0;
  let totalTravelMin = 0;
  let totalServiceMin = 0;
  let totalWaterUsedL = 0;
  let refillCount = 0;
  let dumpCount = 0;
  let prevPos: LonLat | null = vehicle.startPoint;

  function currentMinuteOfDay(): number {
    return cursor.getHours() * 60 + cursor.getMinutes();
  }

  function tryInsertWaterRefill(reasonPrefix: string) {
    // No internal "is it actually low yet" guard here on purpose: the caller
    // already decided a refill is needed — either the *upcoming* segment
    // would breach the reserve (checked ahead of time, before `waterRemaining`
    // reflects it) or a mid-loop top-up was requested directly. Re-checking
    // the current level here would silently skip the proactive case.
    if (!Number.isFinite(vehicle.waterCapacityL)) return;
    const from: LonLat = prevPos ?? [34.9075, 32.1775];
    const ranked = rankWaterPointsSync(waterPoints, {
      from,
      vehicle: { resourceTypeId: vehicle.resourceTypeId, widthM: vehicle.widthM, heightM: vehicle.heightM },
      dayCode,
      atMinute: currentMinuteOfDay(),
      travelSpeedKmh: vehicle.avgTravelSpeedKmh,
    });
    const chosen = ranked.find((p) => p.eligible);
    if (!chosen) return; // Scenario ג with no alternative at all: nothing to insert, feasibility will flag it.

    const arrival = addMinutes(cursor, chosen.travelMinutes);
    const litersToLoad = Math.max(0, (vehicle.waterCapacityL ?? 0) - waterRemaining);
    const fillMin = fillMinutesFor(litersToLoad, chosen.flowLitersPerMin, chosen.fillMinutes);
    const departure = addMinutes(arrival, fillMin + chosen.waitMinutes);

    events.push({
      kind: "SERVICE_STOP",
      serviceKind: "WATER_REFILL",
      sequenceOrder: sequenceOrder++,
      pointId: chosen.id,
      pointName: chosen.name,
      plannedArrival: arrival,
      plannedDeparture: departure,
      travelDistanceM: chosen.distanceM,
      travelTimeMin: chosen.travelMinutes,
      serviceTimeMin: fillMin + chosen.waitMinutes,
      litersLoaded: Math.round(litersToLoad * 10) / 10,
      reason: `${reasonPrefix} — נבחרה "${chosen.name}" (${(chosen.distanceM / 1000).toFixed(1)} ק"מ, ${chosen.totalCostMinutes} דק')`,
      basis: "ESTIMATED",
    });

    // The nearest *eligible* one was used; report the detour cost only when a
    // rejected candidate was actually closer, so a route with no real
    // alternative is not charged for one.
    const closerRejected = ranked.find((p) => !p.eligible && p.distanceM < chosen.distanceM);
    if (closerRejected) costInputs.distantWaterPointKm += (chosen.distanceM - closerRejected.distanceM) / 1000;

    totalTravelMin += chosen.travelMinutes;
    totalServiceMin += fillMin + chosen.waitMinutes;
    costInputs.travelMinutes += chosen.travelMinutes;
    costInputs.refillMinutes += fillMin + chosen.waitMinutes;
    refillCount++;
    waterRemaining = vehicle.waterCapacityL ?? waterRemaining;
    cursor = departure;
    prevPos = [chosen.lon, chosen.lat];
  }

  function tryInsertWasteDump(reasonPrefix: string) {
    if (!Number.isFinite(wasteCapacity) || wasteAccumulated < wasteCapacity * (1 - WASTE_RESERVE_FRACTION)) return;
    const from: LonLat = prevPos ?? [34.9075, 32.1775];
    const ranked = rankWastePointsSync(wastePoints, {
      from,
      vehicle: { resourceTypeId: vehicle.resourceTypeId, widthM: vehicle.widthM, heightM: vehicle.heightM },
      dayCode,
      atMinute: currentMinuteOfDay(),
      travelSpeedKmh: vehicle.avgTravelSpeedKmh,
    });
    const chosen = ranked.find((p) => p.eligible);
    if (!chosen) return;

    const arrival = addMinutes(cursor, chosen.travelMinutes);
    const departure = addMinutes(arrival, chosen.dumpMinutes + chosen.waitMinutes);

    events.push({
      kind: "SERVICE_STOP",
      serviceKind: "WASTE_DISPOSAL",
      sequenceOrder: sequenceOrder++,
      pointId: chosen.id,
      pointName: chosen.name,
      plannedArrival: arrival,
      plannedDeparture: departure,
      travelDistanceM: chosen.distanceM,
      travelTimeMin: chosen.travelMinutes,
      serviceTimeMin: chosen.dumpMinutes + chosen.waitMinutes,
      litersLoaded: null,
      reason: `${reasonPrefix} — נבחרה "${chosen.name}"`,
      basis: "ESTIMATED",
    });

    totalTravelMin += chosen.travelMinutes;
    totalServiceMin += chosen.dumpMinutes + chosen.waitMinutes;
    costInputs.travelMinutes += chosen.travelMinutes;
    costInputs.disposalMinutes += chosen.dumpMinutes + chosen.waitMinutes;
    dumpCount++;
    wasteAccumulated = 0;
    cursor = departure;
    prevPos = [chosen.lon, chosen.lat];
  }

  for (const stop of sequenced) {
    const s = stop.street as DueStreet;
    const info = cleaningInfoByStreet.get(s.id);
    const cleanMin = s.estimatedCleanMinutes ?? defaultCleanMinutes(s.lengthM);

    const startPos: LonLat | null =
      s.startPointLon != null && s.startPointLat != null ? [s.startPointLon, s.startPointLat] : null;
    const endPos: LonLat | null = s.endPointLon != null && s.endPointLat != null ? [s.endPointLon, s.endPointLat] : null;

    const distanceResult = prevPos && startPos ? roadNetworkRouting.distanceMetersWithBasis(prevPos, startPos) : null;
    const distanceFromPrevM = distanceResult ? distanceResult.meters : stop.distanceFromPrevM;
    const distanceBasis = distanceResult ? distanceResult.basis : null;
    const travelMin = travelMinutes(distanceFromPrevM, { travelSpeedKmh: vehicle.avgTravelSpeedKmh });

    const waterNeeded = info
      ? segmentWaterLiters(
          {
            streetId: s.id,
            streetName: s.name,
            lengthM: s.lengthM,
            cleanMinutes: cleanMin,
            requiresWater: info.requiresWater,
            estWaterLitersPer100m: info.estWaterLitersPer100m,
            usesPressureWash: info.usesPressureWash,
            dirtLevel: info.dirtLevel,
            waterFigureIsMeasured: info.waterFigureIsMeasured,
          },
          vehicle
        )
      : 0;

    // Insert a refill *before* this street if doing the street would breach
    // the reserve — the projection has to look ahead, not react after the
    // tank is already empty.
    if (Number.isFinite(vehicle.waterCapacityL) && waterRemaining - waterNeeded < reserveL) {
      tryInsertWaterRefill(`המים צפויים לרדת מתחת לרזרבה לפני "${s.name}"`);
    }

    const plannedStart = addMinutes(cursor, travelMin);
    const plannedEnd = addMinutes(plannedStart, cleanMin);

    const wasteKgDelta = (vehicle.wasteKgPerCleanKm ?? 0) * ((s.lengthM ?? 0) / 1000);
    const wasteAccumulatedAfter = wasteAccumulated + wasteKgDelta;

    events.push({
      kind: "TASK",
      streetId: s.id,
      streetName: s.name,
      sequenceOrder: sequenceOrder++,
      plannedStart,
      plannedEnd,
      distanceFromPrevM,
      distanceBasis,
      travelTimeMin: travelMin,
      cleanTimeMin: cleanMin,
      waterLitersUsed: waterNeeded,
      waterLitersAfter: Number.isFinite(vehicle.waterCapacityL) ? Math.max(0, waterRemaining - waterNeeded) : null,
      waterBasis: info ? (info.waterFigureIsMeasured ? "MEASURED" : "ESTIMATED") : null,
      wasteKgUsed: wasteKgDelta,
      wasteKgAfter: Number.isFinite(wasteCapacity) ? wasteCapacity - wasteAccumulatedAfter : null,
    });

    waterRemaining = Math.max(0, waterRemaining - waterNeeded);
    totalWaterUsedL += waterNeeded;
    wasteAccumulated = wasteAccumulatedAfter;

    totalCleanMin += cleanMin;
    totalTravelMin += travelMin;
    costInputs.travelMinutes += travelMin;
    costInputs.cleanMinutes += cleanMin;
    if (Number.isFinite(vehicle.waterCapacityL) && waterRemaining < reserveL) {
      costInputs.belowReserveLiters += reserveL - waterRemaining;
    }
    if (info?.isHighPriority && info.accessIssue) {
      // Access-troubled high-priority streets are exactly the ones worth
      // flagging even when they *were* served — a route repeatedly forced
      // through a known access problem is not free just because it worked.
    }

    cursor = plannedEnd;
    prevPos = endPos ?? startPos ?? prevPos;

    tryInsertWasteDump(`המיכל מתקרב לקיבולת אחרי "${s.name}"`);
  }

  const capacityMin = shiftEndMin - shiftStartMin;
  const usedMin = currentMinuteOfDay() - shiftStartMin + (cursor.getDate() !== params.shiftDate.getDate() ? 24 * 60 : 0);
  const overCapacity = usedMin > capacityMin;
  if (overCapacity) costInputs.overtimeMinutes += usedMin - capacityMin;

  return {
    events,
    finishAt: cursor,
    overCapacity,
    totalCleanMin,
    totalTravelMin,
    totalServiceMin,
    totalWaterUsedL: Math.round(totalWaterUsedL * 10) / 10,
    refillCount,
    dumpCount,
    costInputs,
    droppedForVehicleFit,
  };
}
