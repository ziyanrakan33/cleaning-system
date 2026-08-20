/**
 * Writes a `RoutePlanResult` produced by the optimisation engine (§10–§12) to
 * the database as a new `WorkPlan` version, then runs the §13 feasibility
 * check against what was actually saved and stores the result on the plan.
 *
 * Kept separate from the engine itself so the engine stays pure and testable
 * without a database, matching the pattern `allocationEngine.ts` already
 * established for the resource-allocation recommendation.
 */
import { prisma } from "@/lib/prisma";
import { formatDateOnly } from "@/server/dateUtils";
import type { RoutePlanResult } from "@/server/routing/optimization/provider";
import { runFeasibilityCheck } from "@/server/routing/optimization/feasibility";
import type { Prisma } from "@/generated/prisma/client";

export type PersistedPlanSummary = {
  workPlanId: string;
  date: string;
  versionNumber: number;
  variant: string;
  variantLabel: string;
  resources: Array<{
    resourceId: string;
    identifier: string;
    name: string | null;
    typeName: string;
    taskCount: number;
    totalCleanMinutes: number;
    totalTravelMinutes: number;
    totalWaterUsedL: number;
    refillCount: number;
    dumpCount: number;
    finishTime: string;
    overCapacity: boolean;
  }>;
  unassignedStreets: Array<{ id: string; name: string; priority: string; reason: string }>;
  totalDueStreets: number;
  totalAssignedStreets: number;
  cost: RoutePlanResult["cost"];
  feasibility: Awaited<ReturnType<typeof runFeasibilityCheck>>;
};

export async function persistRoutePlan(params: {
  date: Date;
  createdById: string;
  chosen: RoutePlanResult;
  /** The cost of the alternatives NOT picked, so the explanation can say why this one won. */
  rejectedAlternatives?: { variantLabel: string; cost: RoutePlanResult["cost"] }[];
}): Promise<PersistedPlanSummary> {
  const { date, createdById, chosen } = params;

  const existingCount = await prisma.workPlan.count({ where: { date } });
  const latestForDate =
    existingCount > 0 ? await prisma.workPlan.findFirst({ where: { date }, orderBy: { versionNumber: "desc" } }) : null;

  const planningExplanation = {
    chosenVariant: chosen.variant,
    chosenVariantLabel: chosen.variantLabel,
    strategyExplanation: chosen.strategyExplanation,
    cost: chosen.cost,
    rejectedAlternatives: params.rejectedAlternatives ?? [],
  };

  const workPlan = await prisma.workPlan.create({
    data: {
      date,
      versionNumber: existingCount + 1,
      status: "DRAFT",
      createdById,
      parentVersionId: latestForDate?.id ?? null,
      variant: chosen.variant,
      planningExplanation: planningExplanation as unknown as Prisma.InputJsonValue,
    },
  });

  const resourceSummaries: PersistedPlanSummary["resources"] = [];

  for (const r of chosen.resources) {
    let taskCount = 0;
    for (const event of r.events) {
      if (event.kind === "TASK") {
        await prisma.workPlanTask.create({
          data: {
            workPlanId: workPlan.id,
            resourceId: r.resourceId,
            streetId: event.streetId,
            sequenceOrder: event.sequenceOrder,
            plannedStart: event.plannedStart,
            plannedEnd: event.plannedEnd,
            distanceM: event.distanceFromPrevM,
            distanceBasis: event.distanceBasis,
            travelTimeMin: event.travelTimeMin,
            cleanTimeMin: event.cleanTimeMin,
            status: "PENDING",
            plannedWaterLiters: event.waterLitersUsed || null,
            projectedWaterAfterL: event.waterLitersAfter,
            waterBasis: event.waterBasis,
            plannedWasteKg: event.wasteKgUsed || null,
            projectedWasteAfterKg: event.wasteKgAfter,
          },
        });
        taskCount++;
      } else {
        await prisma.workPlanServiceStop.create({
          data: {
            workPlanId: workPlan.id,
            resourceId: r.resourceId,
            sequenceOrder: event.sequenceOrder,
            kind: event.serviceKind,
            waterRefillPointId: event.serviceKind === "WATER_REFILL" ? event.pointId : null,
            wasteDisposalPointId: event.serviceKind === "WASTE_DISPOSAL" ? event.pointId : null,
            plannedArrival: event.plannedArrival,
            plannedDeparture: event.plannedDeparture,
            travelDistanceM: event.travelDistanceM,
            travelTimeMin: event.travelTimeMin,
            serviceTimeMin: event.serviceTimeMin,
            litersLoaded: event.litersLoaded,
            reason: event.reason,
            basis: event.basis,
          },
        });
      }
    }

    const capacityMin = r.finishAt ? undefined : undefined; // computed below via overCapacity flag already on r

    resourceSummaries.push({
      resourceId: r.resourceId,
      identifier: r.identifier,
      name: r.name,
      typeName: r.typeName,
      taskCount,
      totalCleanMinutes: Math.round(r.totalCleanMin),
      totalTravelMinutes: Math.round(r.totalTravelMin),
      totalWaterUsedL: r.totalWaterUsedL,
      refillCount: r.refillCount,
      dumpCount: r.dumpCount,
      finishTime: r.finishAt.toTimeString().slice(0, 5),
      overCapacity: r.overCapacity,
    });
    void capacityMin;
  }

  const feasibility = await runFeasibilityCheck(workPlan.id);
  await prisma.workPlan.update({
    where: { id: workPlan.id },
    data: { feasibility: feasibility as unknown as Prisma.InputJsonValue },
  });

  const totalAssignedStreets = resourceSummaries.reduce((sum, r) => sum + r.taskCount, 0);

  return {
    workPlanId: workPlan.id,
    date: formatDateOnly(date),
    versionNumber: workPlan.versionNumber,
    variant: chosen.variant,
    variantLabel: chosen.variantLabel,
    resources: resourceSummaries,
    unassignedStreets: chosen.unassigned,
    totalDueStreets: chosen.totalDueStreets,
    totalAssignedStreets,
    cost: chosen.cost,
    feasibility,
  };
}
