import { prisma } from "@/lib/prisma";
import { balanceWorkload, type EligibleResource } from "./workloadBalancing";
import { sequenceRoute } from "./routeSequencing";
import { defaultCleanMinutes, travelMinutes } from "./estimate";
import type { DueStreet } from "./dueStreets";
import { localDateAtTime } from "@/server/dateUtils";

function minutesToTimeStr(startHHMM: string, addMinutes: number): string {
  const [h, m] = startHHMM.split(":").map(Number);
  const total = h * 60 + m + Math.round(addMinutes);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function timeStrOf(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type RecomputeResult = {
  newWorkPlanId: string;
  versionNumber: number;
  unchanged: boolean;
  orphanedStreetCount: number;
  reassignedCount: number;
  stillUnassignedCount: number;
  affectedResourceIds: string[];
};

/**
 * Re-plans only what's necessary after a resource becomes unavailable
 * mid-day: tasks already marked DONE are preserved as-is; tasks belonging to
 * a now-unavailable resource that aren't done yet are redistributed among
 * the remaining available resources (on top of their existing committed
 * time, not from zero); everything else in the plan is untouched. The
 * result is a new plan version — nothing is overwritten.
 */
export async function recomputePlan(workPlanId: string, changedById: string): Promise<RecomputeResult> {
  const plan = await prisma.workPlan.findUnique({
    where: { id: workPlanId },
    include: {
      tasks: {
        include: {
          street: { include: { allowedResourceTypes: { select: { id: true } } } },
          resource: true,
        },
      },
    },
  });
  if (!plan) throw new Error("Work plan not found");

  const resourceIds = [...new Set(plan.tasks.map((t) => t.resourceId))];
  const currentResources = await prisma.resource.findMany({
    where: { id: { in: resourceIds } },
    include: { allowedZones: { select: { id: true } }, allowedStreets: { select: { id: true } } },
  });
  const resourceById = new Map(currentResources.map((r) => [r.id, r]));

  const availability = await prisma.resourceAvailability.findMany({ where: { date: plan.date } });
  const unavailableToday = new Set(availability.filter((a) => a.status !== "AVAILABLE").map((a) => a.resourceId));

  function isResourceUsable(resourceId: string): boolean {
    const r = resourceById.get(resourceId);
    if (!r || !r.active || r.status !== "ACTIVE") return false;
    if (unavailableToday.has(resourceId)) return false;
    return true;
  }

  const keepTasks = plan.tasks.filter((t) => t.status === "DONE" || isResourceUsable(t.resourceId));
  const orphanedTasks = plan.tasks.filter((t) => t.status !== "DONE" && !isResourceUsable(t.resourceId));

  if (orphanedTasks.length === 0) {
    return {
      newWorkPlanId: plan.id,
      versionNumber: plan.versionNumber,
      unchanged: true,
      orphanedStreetCount: 0,
      reassignedCount: 0,
      stillUnassignedCount: 0,
      affectedResourceIds: [],
    };
  }

  const orphanedStreets: DueStreet[] = orphanedTasks.map((t) => t.street as unknown as DueStreet);

  // Resources still usable now, whether or not they had tasks originally —
  // an available-but-idle resource can pick up slack too.
  const usableResources = await prisma.resource.findMany({
    where: { active: true, status: "ACTIVE", id: { notIn: [...unavailableToday] }, workHoursStart: { not: null }, workHoursEnd: { not: null } },
    include: { allowedZones: { select: { id: true } }, allowedStreets: { select: { id: true } } },
  });

  const eligibleResources: EligibleResource[] = usableResources.map((r) => ({
    id: r.id,
    resourceTypeId: r.resourceTypeId,
    allowedZoneIds: r.allowedZones.map((z) => z.id),
    allowedStreetIds: r.allowedStreets.map((s) => s.id),
    workHoursStart: r.workHoursStart!,
    workHoursEnd: r.workHoursEnd!,
  }));

  // Committed minutes = clean+travel time already spent on kept tasks for
  // each resource, so recompute never overbooks past what's already planned.
  const committedMin = new Map<string, number>();
  const lastEndTime = new Map<string, string>();
  for (const t of keepTasks) {
    committedMin.set(t.resourceId, (committedMin.get(t.resourceId) ?? 0) + (t.cleanTimeMin ?? 0) + (t.travelTimeMin ?? 0));
    const endStr = timeStrOf(t.plannedEnd);
    const prevEnd = lastEndTime.get(t.resourceId);
    if (!prevEnd || endStr > prevEnd) lastEndTime.set(t.resourceId, endStr);
  }

  const { assignments, unassigned } = balanceWorkload(orphanedStreets, eligibleResources, committedMin);

  const workPlan = await prisma.workPlan.create({
    data: {
      date: plan.date,
      versionNumber: plan.versionNumber + 1,
      status: "DRAFT",
      createdById: changedById,
      parentVersionId: plan.id,
    },
  });

  // Copy forward kept tasks as new rows under the new plan version.
  for (const t of keepTasks) {
    await prisma.workPlanTask.create({
      data: {
        workPlanId: workPlan.id,
        resourceId: t.resourceId,
        streetId: t.streetId,
        sequenceOrder: t.sequenceOrder,
        plannedStart: t.plannedStart,
        plannedEnd: t.plannedEnd,
        distanceM: t.distanceM,
        travelTimeMin: t.travelTimeMin,
        cleanTimeMin: t.cleanTimeMin,
        status: t.status,
        actualStart: t.actualStart,
        actualEnd: t.actualEnd,
        actualNotes: t.actualNotes,
        employeeComment: t.employeeComment,
      },
    });
  }

  let reassignedCount = 0;
  const affectedResourceIds = new Set<string>();

  for (const resource of usableResources) {
    const newStreets = assignments.get(resource.id) ?? [];
    if (newStreets.length === 0) continue;
    affectedResourceIds.add(resource.id);

    const sequenced = sequenceRoute(newStreets);
    const existingMaxSeq = Math.max(
      -1,
      ...keepTasks.filter((t) => t.resourceId === resource.id).map((t) => t.sequenceOrder)
    );
    let cursorTime = lastEndTime.get(resource.id) ?? resource.workHoursStart!;
    let seq = existingMaxSeq + 1;

    for (const stop of sequenced) {
      const s = stop.street as DueStreet;
      const cleanMin = s.estimatedCleanMinutes ?? defaultCleanMinutes(s.lengthM);
      const travelMin = travelMinutes(stop.distanceFromPrevM, resource.attributes);
      const plannedStartStr = minutesToTimeStr(cursorTime, travelMin);
      const plannedEndStr = minutesToTimeStr(plannedStartStr, cleanMin);

      const [sh, sm] = plannedStartStr.split(":").map(Number);
      const [eh, em] = plannedEndStr.split(":").map(Number);
      const plannedStart = localDateAtTime(plan.date, sh, sm);
      const plannedEnd = localDateAtTime(plan.date, eh, em);

      await prisma.workPlanTask.create({
        data: {
          workPlanId: workPlan.id,
          resourceId: resource.id,
          streetId: s.id,
          sequenceOrder: seq++,
          plannedStart,
          plannedEnd,
          distanceM: stop.distanceFromPrevM,
          travelTimeMin: travelMin,
          cleanTimeMin: cleanMin,
          status: "PENDING",
        },
      });

      cursorTime = plannedEndStr;
      reassignedCount++;
    }
  }

  await prisma.workPlanChange.create({
    data: {
      workPlanId: workPlan.id,
      changedById,
      changeType: "RECOMPUTE",
      description: `חושבה מחדש בעקבות אי-זמינות משאב. ${orphanedTasks.length} משימות הושפעו, ${reassignedCount} שובצו מחדש, ${unassigned.length} נותרו לא משובצות.`,
      before: { workPlanId: plan.id, versionNumber: plan.versionNumber },
      after: { workPlanId: workPlan.id, versionNumber: workPlan.versionNumber },
    },
  });

  return {
    newWorkPlanId: workPlan.id,
    versionNumber: workPlan.versionNumber,
    unchanged: false,
    orphanedStreetCount: orphanedTasks.length,
    reassignedCount,
    stillUnassignedCount: unassigned.length,
    affectedResourceIds: [...affectedResourceIds],
  };
}
