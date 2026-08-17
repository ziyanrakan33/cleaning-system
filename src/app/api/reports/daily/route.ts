import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { parseDateOnly, formatDateOnly } from "@/server/dateUtils";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "reports.view")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");
  if (!dateStr) return NextResponse.json({ error: "missing date" }, { status: 400 });
  const date = parseDateOnly(dateStr);

  const plan = await prisma.workPlan.findFirst({
    where: { date },
    orderBy: { versionNumber: "desc" },
    include: {
      tasks: {
        orderBy: [{ resourceId: "asc" }, { sequenceOrder: "asc" }],
        include: {
          street: { select: { name: true, type: true, priority: true, zone: { select: { name: true } } } },
          resource: { select: { identifier: true, name: true, resourceType: { select: { name: true } } } },
        },
      },
    },
  });

  if (!plan) {
    return NextResponse.json({ date: formatDateOnly(date), versionNumber: null, rows: [] });
  }

  return NextResponse.json({
    date: formatDateOnly(date),
    versionNumber: plan.versionNumber,
    status: plan.status,
    rows: plan.tasks.map((t) => ({
      resourceLabel: `${t.resource.resourceType.name} ${t.resource.identifier}${t.resource.name ? " · " + t.resource.name : ""}`,
      sequenceOrder: t.sequenceOrder + 1,
      streetName: t.street.name,
      zoneName: t.street.zone?.name ?? "ללא אזור",
      priority: t.street.priority,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      distanceM: t.distanceM,
      status: t.status,
    })),
  });
}
