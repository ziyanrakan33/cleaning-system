import { prisma } from "@/lib/prisma";
import { roadNetworkRouting } from "@/server/routing/graph";
import { travelMinutes } from "./estimate";
import { localDateAtTime } from "@/server/dateUtils";
import { resolveVehicleProfile } from "@/server/resources/operationalProfile";
import { segmentWaterLiters } from "@/server/routing/optimization/water";

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTimeParts(totalMinutes: number): [number, number] {
  const hh = Math.floor(totalMinutes / 60) % 24;
  const mm = Math.round(totalMinutes % 60);
  return [hh, mm];
}

/**
 * Re-walks a resource's task list in its current sequence order, recomputing
 * real travel distance (road graph, not a straight line) between consecutive
 * streets and cascading planned_start/planned_end from the resource's
 * start-of-day. Used after any manual reorder/reassignment so the timeline
 * stays consistent — not a full re-optimization, just correct bookkeeping.
 */
async function resequenceResource(workPlanId: string, resourceId: string, date: Date) {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    include: { resourceType: true, operationalProfile: true },
  });
  if (!resource?.workHoursStart) return;

  const tasks = await prisma.workPlanTask.findMany({
    where: { workPlanId, resourceId },
    orderBy: { sequenceOrder: "asc" },
    include: {
      street: {
        select: {
          startPointLon: true,
          startPointLat: true,
          endPointLon: true,
          endPointLat: true,
          lengthM: true,
          cleaningProfile: true,
        },
      },
    },
  });

  const vehicle = resolveVehicleProfile(resource);

  let cursorMin = hhmmToMinutes(resource.workHoursStart);
  let prevEnd: [number, number] | null = null;
  // Re-simulating past service stops during a manual drag is out of scope
  // here (PlanEditorBoard has no way to add one yet) — the tank is walked
  // down from full capacity on every resequence instead, which keeps the
  // "would we run dry in this order" signal honest even though it does not
  // account for a refill stop elsewhere in the plan.
  let waterRemaining = vehicle.waterCapacityL;

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const start: [number, number] | null =
      t.street.startPointLon != null && t.street.startPointLat != null ? [t.street.startPointLon, t.street.startPointLat] : null;
    const end: [number, number] | null =
      t.street.endPointLon != null && t.street.endPointLat != null ? [t.street.endPointLon, t.street.endPointLat] : null;

    const distanceResult = prevEnd && start ? roadNetworkRouting.distanceMetersWithBasis(prevEnd, start) : null;
    const distanceM = distanceResult ? distanceResult.meters : 0;
    const distanceBasis = distanceResult ? distanceResult.basis : null;
    const travelMin = travelMinutes(distanceM, resource.attributes);
    const cleanMin = t.cleanTimeMin ?? 10;

    cursorMin += travelMin;
    const [sh, sm] = minutesToTimeParts(cursorMin);
    const plannedStart = localDateAtTime(date, sh, sm);

    cursorMin += cleanMin;
    const [eh, em] = minutesToTimeParts(cursorMin);
    const plannedEnd = localDateAtTime(date, eh, em);

    const profile = t.street.cleaningProfile;
    let waterUsed: number | null = null;
    let waterAfter: number | null = null;
    let waterBasis: "ESTIMATED" | "MEASURED" | null = null;
    if (waterRemaining !== null && profile) {
      waterUsed = segmentWaterLiters(
        {
          streetId: t.streetId,
          streetName: "",
          lengthM: t.street.lengthM,
          cleanMinutes: cleanMin,
          requiresWater: profile.requiresWater,
          estWaterLitersPer100m: profile.estWaterLitersPer100m,
          usesPressureWash: profile.usesPressureWash,
          dirtLevel: profile.dirtDynamicLevel ?? profile.dirtBaseLevel,
          waterFigureIsMeasured: profile.dataMode === "DATA_INFORMED",
        },
        vehicle
      );
      waterRemaining = Math.max(0, waterRemaining - waterUsed);
      waterAfter = waterRemaining;
      waterBasis = profile.dataMode === "DATA_INFORMED" ? "MEASURED" : "ESTIMATED";
    }

    await prisma.workPlanTask.update({
      where: { id: t.id },
      data: {
        sequenceOrder: i,
        plannedStart,
        plannedEnd,
        distanceM,
        distanceBasis,
        travelTimeMin: travelMin,
        plannedWaterLiters: waterUsed,
        projectedWaterAfterL: waterAfter,
        waterBasis,
      },
    });

    prevEnd = end ?? start ?? prevEnd;
  }

  const capacityMin = hhmmToMinutes(resource.workHoursEnd!) - hhmmToMinutes(resource.workHoursStart);
  const usedMin = cursorMin - hhmmToMinutes(resource.workHoursStart);
  return { overCapacity: usedMin > capacityMin, finishMinutes: cursorMin };
}

export async function moveTask(
  taskId: string,
  targetResourceId: string,
  targetIndex: number,
  changedById: string
) {
  const task = await prisma.workPlanTask.findUnique({ where: { id: taskId }, include: { workPlan: true } });
  if (!task) throw new Error("Task not found");

  const sourceResourceId = task.resourceId;
  const workPlanId = task.workPlanId;
  const date = task.workPlan.date;

  // Re-index: pull the task out, then re-insert at targetIndex within the target resource's list.
  await prisma.workPlanTask.update({ where: { id: taskId }, data: { resourceId: targetResourceId } });

  const targetTasks = await prisma.workPlanTask.findMany({
    where: { workPlanId, resourceId: targetResourceId },
    orderBy: { sequenceOrder: "asc" },
  });
  const reordered = targetTasks.filter((t) => t.id !== taskId);
  reordered.splice(Math.max(0, Math.min(targetIndex, reordered.length)), 0, task);

  for (let i = 0; i < reordered.length; i++) {
    await prisma.workPlanTask.update({ where: { id: reordered[i].id }, data: { sequenceOrder: i } });
  }

  const [targetResult] = await Promise.all([
    resequenceResource(workPlanId, targetResourceId, date),
    sourceResourceId !== targetResourceId ? resequenceResource(workPlanId, sourceResourceId, date) : Promise.resolve(undefined),
  ]);

  await prisma.workPlanChange.create({
    data: {
      workPlanId,
      changedById,
      changeType: "MANUAL_MOVE",
      description: `משימה הועברה ${sourceResourceId !== targetResourceId ? "בין כלים" : "בתוך אותו כלי"}`,
      before: { resourceId: sourceResourceId },
      after: { resourceId: targetResourceId },
    },
  });

  return { overCapacity: targetResult?.overCapacity ?? false };
}
