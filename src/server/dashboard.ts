import { prisma } from "@/lib/prisma";
import { todayDateOnly } from "@/server/dateUtils";
import { getDueStreets } from "@/server/scheduling/dueStreets";

export async function getDashboardStats() {
  const today = todayDateOnly();

  const [totalStreets, unassignedZoneStreets, totalZones, totalResources, activeResources, brokenResources, streetsByPriority] =
    await Promise.all([
      prisma.street.count({ where: { active: true } }),
      prisma.street.count({ where: { active: true, zoneId: null } }),
      prisma.operationalZone.count({ where: { active: true } }),
      prisma.resource.count({ where: { active: true } }),
      prisma.resource.count({ where: { active: true, status: "ACTIVE" } }),
      prisma.resource.count({ where: { active: true, status: "BROKEN" } }),
      prisma.street.groupBy({ by: ["priority"], where: { active: true }, _count: true }),
    ]);

  const dueToday = await getDueStreets(today);

  const latestPlan = await prisma.workPlan.findFirst({
    where: { date: today },
    orderBy: { versionNumber: "desc" },
    include: {
      tasks: {
        include: {
          resource: { select: { id: true, identifier: true, resourceType: { select: { name: true } } } },
          street: { select: { id: true, zoneId: true, name: true } },
        },
      },
    },
  });

  const plannedStreetIds = new Set(latestPlan?.tasks.map((t) => t.streetId) ?? []);
  const dueButUnplanned = dueToday.filter((s) => !plannedStreetIds.has(s.id));
  const coveragePct = dueToday.length > 0 ? Math.round((plannedStreetIds.size / dueToday.length) * 100) : 100;

  const plannedWorkMinutes = (latestPlan?.tasks ?? []).reduce(
    (sum, t) => sum + (t.cleanTimeMin ?? 0) + (t.travelTimeMin ?? 0),
    0
  );

  const loadByResource = new Map<string, { label: string; taskCount: number; minutes: number }>();
  for (const t of latestPlan?.tasks ?? []) {
    const key = t.resourceId;
    const entry = loadByResource.get(key) ?? {
      label: `${t.resource.resourceType.name} ${t.resource.identifier}`,
      taskCount: 0,
      minutes: 0,
    };
    entry.taskCount++;
    entry.minutes += (t.cleanTimeMin ?? 0) + (t.travelTimeMin ?? 0);
    loadByResource.set(key, entry);
  }

  const zones = await prisma.operationalZone.findMany({ where: { active: true }, select: { id: true, name: true, color: true } });
  const loadByZone = new Map<string, { name: string; color: string; taskCount: number }>();
  for (const z of zones) loadByZone.set(z.id, { name: z.name, color: z.color, taskCount: 0 });
  for (const t of latestPlan?.tasks ?? []) {
    if (t.street.zoneId && loadByZone.has(t.street.zoneId)) {
      loadByZone.get(t.street.zoneId)!.taskCount++;
    }
  }

  return {
    totalStreets,
    unassignedZoneStreets,
    totalZones,
    totalResources,
    activeResources,
    brokenResources,
    streetsByPriority: streetsByPriority.map((r) => ({ priority: r.priority, count: r._count })),
    dueTodayCount: dueToday.length,
    plannedTodayCount: plannedStreetIds.size,
    unplannedTodayCount: dueButUnplanned.length,
    unplannedToday: dueButUnplanned.slice(0, 50).map((s) => ({ id: s.id, name: s.name, priority: s.priority })),
    unplannedTodayFull: dueButUnplanned.map((s) => ({ id: s.id, name: s.name, priority: s.priority, zoneId: s.zoneId })),
    coveragePct,
    plannedWorkHours: Math.round((plannedWorkMinutes / 60) * 10) / 10,
    hasPlanToday: !!latestPlan,
    loadByResource: [...loadByResource.values()],
    loadByZone: [...loadByZone.values()],
  };
}
