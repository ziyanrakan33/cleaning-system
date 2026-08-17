import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { todayDateOnly } from "@/server/dateUtils";

/** Everything the map's zone panel shows when a zone is clicked. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  const { id } = await params;
  const showMoney = can(session.user.role, "finance.view");

  const zone = await prisma.operationalZone.findUnique({
    where: { id },
    include: {
      contractArea: {
        include: {
          contractor: { select: { name: true } },
          quotas: {
            include: { resourceType: { select: { name: true, code: true, category: true } } },
            orderBy: { lineNumber: "asc" },
          },
        },
      },
    },
  });
  if (!zone) return NextResponse.json({ error: "אזור לא נמצא" }, { status: 404 });

  // Must go through the date-only helper: WorkPlan.date is @db.Date and a
  // locally-constructed midnight lands on the previous day east of UTC.
  const today = todayDateOnly();

  const [byType, segmentAgg, reviewCount, todayPlan] = await Promise.all([
    prisma.street.groupBy({
      by: ["type"],
      where: { zoneId: id, active: true },
      _count: true,
      _sum: { lengthM: true },
    }),
    prisma.streetSegment.aggregate({
      where: { zoneId: id },
      _sum: { lengthM: true },
      _count: true,
    }),
    prisma.streetSegment.count({ where: { zoneId: id, verificationStatus: "REQUIRES_REVIEW" } }),
    prisma.workPlan.findFirst({
      where: { date: today },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true, status: true },
    }),
  ]);

  const taskStats = { total: 0, done: 0, notDone: 0, pending: 0 };
  if (todayPlan) {
    const grouped = await prisma.workPlanTask.groupBy({
      by: ["status"],
      where: { workPlanId: todayPlan.id, street: { zoneId: id } },
      _count: true,
    });
    for (const g of grouped) {
      taskStats.total += g._count;
      if (g.status === "DONE") taskStats.done += g._count;
      else if (g.status === "NOT_DONE" || g.status === "PROBLEM") taskStats.notDone += g._count;
      else taskStats.pending += g._count;
    }
  }

  // Resources currently permitted to work this zone.
  const activeResources = await prisma.resource.count({
    where: { active: true, status: "ACTIVE", allowedZones: { some: { id } } },
  });

  const streetsCount = byType
    .filter((t) => t.type === "STREET")
    .reduce((s, t) => s + t._count, 0);
  const pathsCount = byType
    .filter((t) => t.type === "PATH" || t.type === "PEDESTRIAN_MALL")
    .reduce((s, t) => s + t._count, 0);
  const publicAreaCount = byType
    .filter((t) => t.type === "PUBLIC_AREA")
    .reduce((s, t) => s + t._count, 0);

  return NextResponse.json({
    id: zone.id,
    name: zone.name,
    code: zone.code,
    color: zone.color,
    zoneNumber: zone.zoneNumber,
    hasBoundary: zone.verificationStatus !== "REQUIRES_REVIEW",
    boundaryStatus: zone.verificationStatus,
    contractArea: zone.contractArea
      ? {
          name: zone.contractArea.name,
          areaNumber: zone.contractArea.areaNumber,
          contractorName: zone.contractArea.contractor?.name ?? null,
        }
      : null,
    contractAreaStatus: zone.contractAreaStatus,
    streetsCount,
    pathsCount,
    publicAreaCount,
    segmentCount: segmentAgg._count,
    // Segment length attributes a boundary-crossing street to each zone by the
    // part actually inside it, rather than crediting one zone with all of it.
    totalKm: (segmentAgg._sum.lengthM ?? 0) / 1000,
    segmentsRequiringReview: reviewCount,
    activeResources,
    todayPlan: todayPlan
      ? { versionNumber: todayPlan.versionNumber, status: todayPlan.status, ...taskStats }
      : null,
    completionPercent:
      taskStats.total > 0 ? Math.round((taskStats.done / taskStats.total) * 100) : null,
    contractQuotas: zone.contractArea
      ? zone.contractArea.quotas.map((q) => ({
          lineNumber: q.lineNumber,
          resourceName: q.resourceType.name,
          category: q.resourceType.category,
          quantity: q.quantity,
          shiftHours: q.shiftHours,
          tenderQuantity: q.tenderQuantity,
          unitPrice: showMoney ? Number(q.unitPrice ?? 0) : null,
          dailyTotal: showMoney ? Number(q.dailyTotal ?? 0) : null,
        }))
      : [],
    updatedAt: zone.updatedAt.toISOString(),
  });
}
