import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayDateOnly } from "@/server/dateUtils";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = todayDateOnly();
  const latestPlan = await prisma.workPlan.findFirst({
    where: { date: today },
    orderBy: { versionNumber: "desc" },
    include: {
      tasks: {
        select: {
          streetId: true,
          status: true,
          resourceId: true,
          resource: { select: { identifier: true, resourceType: { select: { name: true } } } },
        },
      },
    },
  });

  return NextResponse.json({
    workPlanId: latestPlan?.id ?? null,
    tasks: (latestPlan?.tasks ?? []).map((t) => ({
      streetId: t.streetId,
      status: t.status,
      resourceLabel: `${t.resource.resourceType.name} ${t.resource.identifier}`,
    })),
  });
}
