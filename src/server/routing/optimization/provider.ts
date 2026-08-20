/**
 * The seam §10 asks for: swap the deterministic engine below for OR-Tools,
 * OSRM-backed VRP, or anything else later, without touching the API routes or
 * the UI that consume it. Everything downstream of `generateRoutePlan()` only
 * ever talks to this interface.
 */
import type { DueStreet } from "@/server/scheduling/dueStreets";
import type { ResolvedVehicleProfile } from "@/server/resources/operationalProfile";
import type { EligibleResource } from "@/server/scheduling/workloadBalancing";
import type { WaterPointRow, WastePointRow } from "@/server/servicePoints/service";
import type { RouteCostWeights } from "@/server/settings/service";
import type { StreetCleaningInfo, RouteEvent } from "./simulate";
import type { CostBreakdown } from "./cost";

export type RoutePlanVariant = "FASTEST" | "DIRT_PRIORITY" | "WATER_SAVING";

export type RoutePlanResourceResult = {
  resourceId: string;
  identifier: string;
  name: string | null;
  typeName: string;
  events: RouteEvent[];
  finishAt: Date;
  overCapacity: boolean;
  totalCleanMin: number;
  totalTravelMin: number;
  totalServiceMin: number;
  totalWaterUsedL: number;
  refillCount: number;
  dumpCount: number;
};

export type UnassignedStreet = { id: string; name: string; priority: string; reason: string };

export type RoutePlanResult = {
  variant: RoutePlanVariant;
  variantLabel: string;
  resources: RoutePlanResourceResult[];
  unassigned: UnassignedStreet[];
  totalDueStreets: number;
  cost: CostBreakdown;
  /** Human-readable summary of what this variant optimised for. */
  strategyExplanation: string;
};

export type RoutePlanInput = {
  date: Date;
  dueStreets: DueStreet[];
  eligibleResources: (EligibleResource & { vehicle: ResolvedVehicleProfile })[];
  cleaningInfoByStreet: Map<string, StreetCleaningInfo>;
  waterPoints: WaterPointRow[];
  wastePoints: WastePointRow[];
  costWeights: RouteCostWeights;
  variant: RoutePlanVariant;
};

export interface RouteOptimizationProvider {
  plan(input: RoutePlanInput): Promise<RoutePlanResult>;
}
