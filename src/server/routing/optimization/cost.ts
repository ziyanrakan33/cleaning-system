/**
 * §11 — the route cost function.
 *
 * A single number a route "scores" is meaningless on its own, so `scoreRoute`
 * always returns the itemised breakdown alongside the total — that breakdown
 * is exactly what gets shown to the manager when two alternatives are placed
 * side by side (§12), and it is what makes "why did A beat B" answerable
 * instead of asserted.
 */
import type { RouteCostWeights } from "@/server/settings/service";

export type CostLineItem = {
  key: keyof RouteCostWeights;
  label: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
};

export type CostBreakdown = {
  total: number;
  lines: CostLineItem[];
};

export const COST_LABELS: Record<keyof RouteCostWeights, string> = {
  travelMinute: "זמן נסיעה",
  deadKilometre: "מרחק נסיעה ללא עבודה",
  cleanMinute: "זמן ניקיון",
  refillMinute: "זמן מילוי מים",
  disposalMinute: "זמן פריקת פסולת",
  overtimeMinute: "איחור מעבר למשמרת",
  unassignedSegment: "אי-ביצוע מקטע",
  skippedHighPriority: "דילוג על מקטע בעדיפות גבוהה",
  distantWaterPoint: "ביקור בנקודת מים רחוקה",
  unsuitableVehicle: "שימוש בכלי שאינו מתאים",
  belowWaterReserve: "ירידה מתחת לרזרבת המים",
  redundantRevisit: "חזרה על אותו מקטע ללא צורך",
};

export type RouteCostInputs = {
  travelMinutes: number;
  deadKilometres: number;
  cleanMinutes: number;
  refillMinutes: number;
  disposalMinutes: number;
  overtimeMinutes: number;
  unassignedSegments: number;
  skippedHighPrioritySegments: number;
  /** Sum of (distanceKm beyond the nearest eligible point) across refill stops. */
  distantWaterPointKm: number;
  unsuitableVehicleAssignments: number;
  belowReserveLiters: number;
  redundantRevisits: number;
};

export const ZERO_COST_INPUTS: RouteCostInputs = {
  travelMinutes: 0,
  deadKilometres: 0,
  cleanMinutes: 0,
  refillMinutes: 0,
  disposalMinutes: 0,
  overtimeMinutes: 0,
  unassignedSegments: 0,
  skippedHighPrioritySegments: 0,
  distantWaterPointKm: 0,
  unsuitableVehicleAssignments: 0,
  belowReserveLiters: 0,
  redundantRevisits: 0,
};

const INPUT_TO_WEIGHT_KEY: Record<keyof RouteCostInputs, keyof RouteCostWeights> = {
  travelMinutes: "travelMinute",
  deadKilometres: "deadKilometre",
  cleanMinutes: "cleanMinute",
  refillMinutes: "refillMinute",
  disposalMinutes: "disposalMinute",
  overtimeMinutes: "overtimeMinute",
  unassignedSegments: "unassignedSegment",
  skippedHighPrioritySegments: "skippedHighPriority",
  distantWaterPointKm: "distantWaterPoint",
  unsuitableVehicleAssignments: "unsuitableVehicle",
  belowReserveLiters: "belowWaterReserve",
  redundantRevisits: "redundantRevisit",
};

/** Merges several resources' cost inputs into one route-level total. */
export function sumCostInputs(items: RouteCostInputs[]): RouteCostInputs {
  return items.reduce((sum, item) => {
    const merged = { ...sum };
    for (const key of Object.keys(sum) as (keyof RouteCostInputs)[]) {
      merged[key] += item[key];
    }
    return merged;
  }, { ...ZERO_COST_INPUTS });
}

export function scoreRoute(inputs: RouteCostInputs, weights: RouteCostWeights): CostBreakdown {
  const lines: CostLineItem[] = (Object.keys(inputs) as (keyof RouteCostInputs)[])
    .map((inputKey) => {
      const weightKey = INPUT_TO_WEIGHT_KEY[inputKey];
      const quantity = Math.round(inputs[inputKey] * 100) / 100;
      const unitCost = weights[weightKey];
      return {
        key: weightKey,
        label: COST_LABELS[weightKey],
        quantity,
        unitCost,
        subtotal: Math.round(quantity * unitCost * 100) / 100,
      };
    })
    .filter((line) => line.quantity !== 0);

  const total = Math.round(lines.reduce((sum, l) => sum + l.subtotal, 0) * 100) / 100;
  return { total, lines };
}
