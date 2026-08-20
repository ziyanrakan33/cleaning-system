/**
 * The deterministic, rule-based `RouteOptimizationProvider` (§10).
 *
 * Built entirely from pieces that already exist and are already tested:
 * `balanceWorkload` for assignment, `sequenceRoute` for ordering (real road
 * graph, nearest-neighbor + 2-opt), and the new `simulateResourceRoute` for
 * turning that order into a timed route with water and service stops. Nothing
 * here shuffles streets at random — every choice traces back to a workload
 * score, a distance, or a capacity check.
 *
 * The three offered variants (§12) differ in two honest ways, not in cosmetic
 * relabeling of the same output:
 *   - FASTEST / DIRT_PRIORITY change the *order* streets are fed into
 *     balanceWorkload, so when capacity is tight, a different set of streets
 *     wins a slot on the plan.
 *   - WATER_SAVING changes the *cost weights* used to score the result and
 *     reports total water/refill stops prominently, so a manager comparing
 *     alternatives sees the real trade-off between finishing fast and using
 *     less water and fewer trips.
 */
import { balanceWorkload } from "@/server/scheduling/workloadBalancing";
import { sequenceRoute } from "@/server/scheduling/routeSequencing";
import { checkVehicleFitsStreet } from "@/server/resources/operationalProfile";
import { sumCostInputs, scoreRoute, ZERO_COST_INPUTS, type RouteCostInputs } from "./cost";
import { simulateResourceRoute } from "./simulate";
import type {
  RouteOptimizationProvider,
  RoutePlanInput,
  RoutePlanResult,
  RoutePlanResourceResult,
  UnassignedStreet,
} from "./provider";
import type { DueStreet } from "@/server/scheduling/dueStreets";
import type { StreetCleaningInfo } from "./simulate";

const VARIANT_LABELS: Record<RoutePlanInput["variant"], string> = {
  FASTEST: "המסלול המהיר ביותר",
  DIRT_PRIORITY: "עדיפות לניקיון (המקטעים המלוכלכים ביותר)",
  WATER_SAVING: "חסכוני במים ובנסיעות",
};

const HIGH_PRIORITY = new Set(["CRITICAL", "HIGH"]);

function orderStreets(
  streets: DueStreet[],
  variant: RoutePlanInput["variant"],
  cleaningInfoByStreet: Map<string, StreetCleaningInfo>
): DueStreet[] {
  const priorityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

  if (variant === "DIRT_PRIORITY") {
    // Dirt score leads; priority breaks ties for streets whose score is
    // unknown, so an unsurveyed critical street is not silently pushed to the
    // back for lack of data.
    return [...streets].sort((a, b) => {
      const scoreA = cleaningInfoByStreet.get(a.id)?.dirtScore ?? null;
      const scoreB = cleaningInfoByStreet.get(b.id)?.dirtScore ?? null;
      if (scoreA !== null && scoreB !== null && scoreA !== scoreB) return scoreB - scoreA;
      if (scoreA !== null && scoreB === null) return -1;
      if (scoreA === null && scoreB !== null) return 1;
      return priorityRank[a.priority] - priorityRank[b.priority];
    });
  }

  // FASTEST and WATER_SAVING both keep the existing priority order — the
  // difference between them is expressed in the cost weights and in which
  // service point gets picked, not in who gets a slot first.
  return [...streets].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}

export const ruleBasedProvider: RouteOptimizationProvider = {
  async plan(input: RoutePlanInput): Promise<RoutePlanResult> {
    const { dueStreets, eligibleResources, cleaningInfoByStreet, waterPoints, wastePoints, costWeights, variant } = input;

    const orderedStreets = orderStreets(dueStreets, variant, cleaningInfoByStreet);
    const { assignments, unassigned: capacityUnassigned } = balanceWorkload(orderedStreets, eligibleResources);

    const unassigned: UnassignedStreet[] = capacityUnassigned.map((s) => ({
      id: s.id,
      name: s.name,
      priority: s.priority,
      reason: "אין משאב פנוי עם קיבולת מספקת במסגרת שעות המשמרת",
    }));

    const resourceResults: RoutePlanResourceResult[] = [];
    const costInputsList: RouteCostInputs[] = [];

    for (const resource of eligibleResources) {
      const assignedStreets = assignments.get(resource.id) ?? [];
      if (assignedStreets.length === 0) continue;

      // §21 scenario ה: drop streets the vehicle genuinely cannot enter (width,
      // path access) even though the coarse type-based eligibility check in
      // balanceWorkload let them through.
      const fitStreets: DueStreet[] = [];
      for (const s of assignedStreets) {
        const info = cleaningInfoByStreet.get(s.id);
        const check = checkVehicleFitsStreet(resource.vehicle, {
          type: s.type,
          allowedResourceTypeIds: s.allowedResourceTypes.map((t) => t.id),
          profileWidthM: info?.profileWidthM ?? null,
          narrowRoad: info?.narrowRoad ?? false,
        });
        if (check.fits) {
          fitStreets.push(s);
        } else {
          unassigned.push({ id: s.id, name: s.name, priority: s.priority, reason: check.reason });
        }
      }
      if (fitStreets.length === 0) continue;

      const sequenced = sequenceRoute(fitStreets);
      const sim = simulateResourceRoute({
        date: input.date,
        shiftDate: input.date,
        vehicle: resource.vehicle,
        sequenced,
        cleaningInfoByStreet,
        waterPoints,
        wastePoints,
      });

      resourceResults.push({
        resourceId: resource.id,
        identifier: resource.vehicle.identifier,
        name: resource.vehicle.name,
        typeName: resource.vehicle.resourceTypeName,
        events: sim.events,
        finishAt: sim.finishAt,
        overCapacity: sim.overCapacity,
        totalCleanMin: sim.totalCleanMin,
        totalTravelMin: sim.totalTravelMin,
        totalServiceMin: sim.totalServiceMin,
        totalWaterUsedL: sim.totalWaterUsedL,
        refillCount: sim.refillCount,
        dumpCount: sim.dumpCount,
      });
      costInputsList.push(sim.costInputs);
    }

    const unassignedCostInputs: RouteCostInputs = { ...ZERO_COST_INPUTS };
    unassignedCostInputs.unassignedSegments = unassigned.length;
    unassignedCostInputs.skippedHighPrioritySegments = unassigned.filter((s) => HIGH_PRIORITY.has(s.priority)).length;

    const totalCostInputs = sumCostInputs([...costInputsList, unassignedCostInputs]);
    const cost = scoreRoute(totalCostInputs, costWeights);

    const totalWater = resourceResults.reduce((sum, r) => sum + r.totalWaterUsedL, 0);
    const totalRefills = resourceResults.reduce((sum, r) => sum + r.refillCount, 0);

    const strategyExplanation =
      variant === "FASTEST"
        ? "המקטעים שובצו לפי סדר עדיפות (קריטי → גבוה → רגיל → נמוך) עם מזעור זמן הנסיעה בין מקטעים באמצעות אלגוריתם מסלול על גבי רשת הכבישים האמיתית."
        : variant === "DIRT_PRIORITY"
        ? "המקטעים שובצו לפי ציון הלכלוך (מהגבוה לנמוך) כך שכאשר אין די קיבולת לכל המקטעים, המלוכלכים ביותר מקבלים עדיפות — גם אם אינם בעדיפות החוזית הגבוהה ביותר."
        : `המקטעים שובצו לפי עדיפות, אך בחירת נקודות המילוי מעדיפה תמיד את הזמינה והקרובה ביותר כדי לצמצם נסיעה וזמן המתנה. סך צריכת מים משוער: ${totalWater.toFixed(0)} ליטר ב-${totalRefills} עצירות מילוי.`;

    return {
      variant,
      variantLabel: VARIANT_LABELS[variant],
      resources: resourceResults,
      unassigned,
      totalDueStreets: dueStreets.length,
      cost,
      strategyExplanation,
    };
  },
};
