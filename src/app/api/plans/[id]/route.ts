import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStreetGeometryForTasks } from "@/server/geo.service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const workPlan = await prisma.workPlan.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: [{ resourceId: "asc" }, { sequenceOrder: "asc" }],
        include: {
          street: { select: { id: true, name: true, type: true, priority: true } },
          resource: { select: { id: true, identifier: true, name: true, resourceType: { select: { name: true } } } },
        },
      },
    },
  });

  if (!workPlan) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const streetIds = [...new Set(workPlan.tasks.map((t) => t.streetId))];
  const geometries = await getStreetGeometryForTasks(streetIds);

  const byResource = new Map<string, typeof workPlan.tasks>();
  for (const task of workPlan.tasks) {
    const key = task.resourceId;
    if (!byResource.has(key)) byResource.set(key, []);
    byResource.get(key)!.push(task);
  }

  const resources = [...byResource.entries()].map(([resourceId, tasks]) => ({
    resourceId,
    identifier: tasks[0].resource.identifier,
    name: tasks[0].resource.name,
    typeName: tasks[0].resource.resourceType.name,
    tasks: tasks.map((t) => ({
      id: t.id,
      sequenceOrder: t.sequenceOrder,
      streetId: t.streetId,
      streetName: t.street.name,
      streetType: t.street.type,
      priority: t.street.priority,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      distanceM: t.distanceM,
      travelTimeMin: t.travelTimeMin,
      cleanTimeMin: t.cleanTimeMin,
      status: t.status,
      geometry: geometries.get(t.streetId) ?? null,
    })),
  }));

  return NextResponse.json({
    id: workPlan.id,
    date: workPlan.date.toISOString().slice(0, 10),
    versionNumber: workPlan.versionNumber,
    status: workPlan.status,
    resources,
  });
}
