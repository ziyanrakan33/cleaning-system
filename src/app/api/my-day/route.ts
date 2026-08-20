import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { todayDateOnly } from "@/server/dateUtils";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Not every /my-day role may open a defect (EMPLOYEE/SITE_SUPERVISOR
  // currently cannot per permissions.ts) — the client uses this to decide
  // whether to show the "raise a defect" shortcut at all, rather than
  // showing a button that will just 403.
  const canCreateDefect = can(session.user.role, "defects.create");

  const resources = await prisma.resource.findMany({
    where: { assignedEmployeeId: session.user.id, active: true },
    select: { id: true, identifier: true, resourceType: { select: { name: true } } },
  });

  const today = todayDateOnly();

  if (resources.length === 0) {
    return NextResponse.json({ resources: [], tasks: [], shiftReports: [], canCreateDefect });
  }

  const resourceIds = resources.map((r) => r.id);
  const shiftReports = await prisma.shiftReport.findMany({
    where: { resourceId: { in: resourceIds }, date: today },
    select: { resourceId: true, id: true },
  });

  // Latest plan version per resource for today.
  const latestPlan = await prisma.workPlan.findFirst({
    where: { date: today, tasks: { some: { resourceId: { in: resourceIds } } } },
    orderBy: { versionNumber: "desc" },
  });

  if (!latestPlan) {
    return NextResponse.json({ resources, tasks: [], shiftReports, canCreateDefect });
  }

  const tasks = await prisma.workPlanTask.findMany({
    where: { workPlanId: latestPlan.id, resourceId: { in: resourceIds } },
    orderBy: [{ resourceId: "asc" }, { sequenceOrder: "asc" }],
    include: {
      street: { select: { id: true, name: true, startPointLat: true, startPointLon: true } },
      resource: { select: { id: true, identifier: true, resourceType: { select: { name: true } } } },
      fieldReports: { select: { id: true }, take: 1 },
    },
  });

  return NextResponse.json({
    resources,
    shiftReports,
    canCreateDefect,
    tasks: tasks.map((t) => ({
      id: t.id,
      resourceId: t.resource.id,
      resourceLabel: `${t.resource.resourceType.name} ${t.resource.identifier}`,
      sequenceOrder: t.sequenceOrder,
      streetId: t.street.id,
      streetName: t.street.name,
      lat: t.street.startPointLat,
      lon: t.street.startPointLon,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      status: t.status,
      employeeComment: t.employeeComment,
      hasFieldReport: t.fieldReports.length > 0,
    })),
  });
}
