import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseDateOnly, addDaysToDateOnly, formatDateOnly } from "@/server/dateUtils";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const startStr = searchParams.get("start");
  if (!startStr) return NextResponse.json({ error: "missing start" }, { status: 400 });

  const start = parseDateOnly(startStr);
  const days = Array.from({ length: 7 }, (_, i) => addDaysToDateOnly(start, i));

  const results = [];
  for (const date of days) {
    const latestPlan = await prisma.workPlan.findFirst({
      where: { date },
      orderBy: { versionNumber: "desc" },
      include: {
        tasks: {
          include: { resource: { select: { id: true, identifier: true, resourceType: { select: { name: true } } } } },
        },
      },
    });

    let resourceSummaries: Array<{ resourceId: string; label: string; taskCount: number }> = [];
    if (latestPlan) {
      const byResource = new Map<string, { label: string; count: number }>();
      for (const t of latestPlan.tasks) {
        const key = t.resourceId;
        const label = `${t.resource.resourceType.name} ${t.resource.identifier}`;
        const existing = byResource.get(key);
        if (existing) existing.count++;
        else byResource.set(key, { label, count: 1 });
      }
      resourceSummaries = [...byResource.entries()].map(([resourceId, v]) => ({
        resourceId,
        label: v.label,
        taskCount: v.count,
      }));
    }

    results.push({
      date: formatDateOnly(date),
      workPlanId: latestPlan?.id ?? null,
      versionNumber: latestPlan?.versionNumber ?? null,
      status: latestPlan?.status ?? null,
      resources: resourceSummaries,
    });
  }

  return NextResponse.json(results);
}
