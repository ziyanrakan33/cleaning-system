import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getStreetGeometryForTasks } from "@/server/geo.service";
import { formatDateOnly } from "@/server/dateUtils";

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
    date: formatDateOnly(workPlan.date),
    versionNumber: workPlan.versionNumber,
    status: workPlan.status,
    resources,
  });
}

const patchSchema = z.object({ status: z.enum(["DRAFT", "CONFIRMED", "ARCHIVED"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const before = await prisma.workPlan.findUnique({ where: { id }, select: { status: true } });
  const plan = await prisma.workPlan.update({ where: { id }, data: { status: parsed.data.status } });

  await prisma.workPlanChange.create({
    data: {
      workPlanId: id,
      changedById: session.user.id,
      changeType: "STATUS_CHANGE",
      description: `סטטוס שונה מ-${before?.status} ל-${parsed.data.status}`,
      before: { status: before?.status },
      after: { status: parsed.data.status },
    },
  });

  return NextResponse.json(plan);
}
