import { prisma } from "@/lib/prisma";
import { getDueStreets, type DueStreet } from "./dueStreets";
import { balanceWorkload, type EligibleResource } from "./workloadBalancing";
import { sequenceRoute } from "./routeSequencing";
import { defaultCleanMinutes, travelMinutes } from "./estimate";

export type GeneratePlanResult = {
  workPlanId: string;
  date: string;
  versionNumber: number;
  resources: Array<{
    resourceId: string;
    identifier: string;
    name: string | null;
    typeName: string;
    taskCount: number;
    totalStreetKm: number;
    totalCleanMinutes: number;
    totalTravelMinutes: number;
    finishTime: string;
    overCapacity: boolean;
  }>;
  unassignedStreets: Array<{ id: string; name: string; priority: string }>;
  totalDueStreets: number;
  totalAssignedStreets: number;
};

function minutesToTimeStr(startHHMM: string, addMinutes: number): string {
  const [h, m] = startHHMM.split(":").map(Number);
  const total = h * 60 + m + Math.round(addMinutes);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function generateWorkPlan(date: Date, createdById: string): Promise<GeneratePlanResult> {
  const dueStreets = await getDueStreets(date);

  const resourcesRaw = await prisma.resource.findMany({
    where: { active: true, status: "ACTIVE" },
    include: { resourceType: true, allowedZones: { select: { id: true } }, allowedStreets: { select: { id: true } } },
  });

  const availability = await prisma.resourceAvailability.findMany({ where: { date } });
  const unavailableIds = new Set(
    availability.filter((a) => a.status !== "AVAILABLE").map((a) => a.resourceId)
  );

  const availableResources = resourcesRaw.filter((r) => !unavailableIds.has(r.id) && r.workHoursStart && r.workHoursEnd);

  const eligibleResources: EligibleResource[] = availableResources.map((r) => ({
    id: r.id,
    resourceTypeId: r.resourceTypeId,
    allowedZoneIds: r.allowedZones.map((z) => z.id),
    allowedStreetIds: r.allowedStreets.map((s) => s.id),
    workHoursStart: r.workHoursStart!,
    workHoursEnd: r.workHoursEnd!,
  }));

  const { assignments, unassigned } = balanceWorkload(dueStreets, eligibleResources);

  // Determine next version number for this date.
  const existingCount = await prisma.workPlan.count({ where: { date } });
  const latestForDate = existingCount > 0
    ? await prisma.workPlan.findFirst({ where: { date }, orderBy: { versionNumber: "desc" } })
    : null;

  const workPlan = await prisma.workPlan.create({
    data: {
      date,
      versionNumber: existingCount + 1,
      status: "DRAFT",
      createdById,
      parentVersionId: latestForDate?.id ?? null,
    },
  });

  const resourceSummaries: GeneratePlanResult["resources"] = [];

  for (const resource of availableResources) {
    const assignedStreets = assignments.get(resource.id) ?? [];
    if (assignedStreets.length === 0) continue;

    const sequenced = sequenceRoute(assignedStreets);

    let cursorTime = resource.workHoursStart!;
    let totalCleanMin = 0;
    let totalTravelMin = 0;
    let totalLengthM = 0;
    let sequenceOrder = 0;

    for (const stop of sequenced) {
      const s = stop.street as DueStreet;
      const cleanMin = s.estimatedCleanMinutes ?? defaultCleanMinutes(s.lengthM);
      const travelMin = travelMinutes(stop.distanceFromPrevM, resource.attributes);

      const plannedStartStr = minutesToTimeStr(cursorTime, travelMin);
      const plannedEndStr = minutesToTimeStr(plannedStartStr, cleanMin);

      const [sh, sm] = plannedStartStr.split(":").map(Number);
      const [eh, em] = plannedEndStr.split(":").map(Number);
      const plannedStart = new Date(date);
      plannedStart.setHours(sh, sm, 0, 0);
      const plannedEnd = new Date(date);
      plannedEnd.setHours(eh, em, 0, 0);

      await prisma.workPlanTask.create({
        data: {
          workPlanId: workPlan.id,
          resourceId: resource.id,
          streetId: s.id,
          sequenceOrder: sequenceOrder++,
          plannedStart,
          plannedEnd,
          distanceM: stop.distanceFromPrevM,
          travelTimeMin: travelMin,
          cleanTimeMin: cleanMin,
          status: "PENDING",
        },
      });

      cursorTime = plannedEndStr;
      totalCleanMin += cleanMin;
      totalTravelMin += travelMin;
      totalLengthM += s.lengthM ?? 0;
    }

    const capacityMin =
      (Number(resource.workHoursEnd!.split(":")[0]) * 60 + Number(resource.workHoursEnd!.split(":")[1])) -
      (Number(resource.workHoursStart!.split(":")[0]) * 60 + Number(resource.workHoursStart!.split(":")[1]));

    resourceSummaries.push({
      resourceId: resource.id,
      identifier: resource.identifier,
      name: resource.name,
      typeName: resource.resourceType.name,
      taskCount: sequenced.length,
      totalStreetKm: Math.round((totalLengthM / 1000) * 10) / 10,
      totalCleanMinutes: Math.round(totalCleanMin),
      totalTravelMinutes: Math.round(totalTravelMin),
      finishTime: cursorTime,
      overCapacity: totalCleanMin + totalTravelMin > capacityMin,
    });
  }

  return {
    workPlanId: workPlan.id,
    date: date.toISOString().slice(0, 10),
    versionNumber: workPlan.versionNumber,
    resources: resourceSummaries,
    unassignedStreets: unassigned.map((s) => ({ id: s.id, name: s.name, priority: s.priority })),
    totalDueStreets: dueStreets.length,
    totalAssignedStreets: dueStreets.length - unassigned.length,
  };
}

