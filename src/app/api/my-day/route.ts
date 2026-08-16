import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayDateOnly } from "@/server/dateUtils";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const resources = await prisma.resource.findMany({
    where: { assignedEmployeeId: session.user.id, active: true },
    select: { id: true, identifier: true, resourceType: { select: { name: true } } },
  });

  if (resources.length === 0) {
    return NextResponse.json({ resources: [], tasks: [] });
  }

  const today = todayDateOnly();
  const resourceIds = resources.map((r) => r.id);

  // Latest plan version per resource for today.
  const latestPlan = await prisma.workPlan.findFirst({
    where: { date: today, tasks: { some: { resourceId: { in: resourceIds } } } },
    orderBy: { versionNumber: "desc" },
  });

  if (!latestPlan) {
    return NextResponse.json({ resources, tasks: [] });
  }

  const tasks = await prisma.workPlanTask.findMany({
    where: { workPlanId: latestPlan.id, resourceId: { in: resourceIds } },
    orderBy: [{ resourceId: "asc" }, { sequenceOrder: "asc" }],
    include: {
      street: { select: { name: true, startPointLat: true, startPointLon: true } },
      resource: { select: { identifier: true, resourceType: { select: { name: true } } } },
    },
  });

  return NextResponse.json({
    resources,
    tasks: tasks.map((t) => ({
      id: t.id,
      resourceLabel: `${t.resource.resourceType.name} ${t.resource.identifier}`,
      sequenceOrder: t.sequenceOrder,
      streetName: t.street.name,
      lat: t.street.startPointLat,
      lon: t.street.startPointLon,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      status: t.status,
      employeeComment: t.employeeComment,
    })),
  });
}
