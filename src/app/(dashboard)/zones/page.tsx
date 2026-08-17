import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { ZonesManager } from "./zones-manager";

export const dynamic = "force-dynamic";

export default async function ZonesPage() {
  const session = await auth();
  const canEdit = can(session?.user?.role, "zones.editBoundary");

  const zones = await prisma.operationalZone.findMany({
    where: { active: true },
    orderBy: [{ zoneNumber: "asc" }, { code: "asc" }],
    include: {
      contractArea: { select: { name: true, contractor: { select: { name: true } } } },
      _count: { select: { streets: true, segments: true } },
    },
  });

  const [streetsAgg, segmentAgg] = await Promise.all([
    prisma.street.groupBy({
      by: ["zoneId"],
      where: { active: true },
      _count: true,
      _sum: { lengthM: true },
    }),
    prisma.streetSegment.groupBy({
      by: ["zoneId"],
      _sum: { lengthM: true },
    }),
  ]);

  const zoneRows = zones.map((z) => {
    const agg = streetsAgg.find((a) => a.zoneId === z.id);
    const seg = segmentAgg.find((a) => a.zoneId === z.id);
    return {
      id: z.id,
      name: z.name,
      code: z.code,
      color: z.color,
      zoneNumber: z.zoneNumber,
      description: z.description,
      hasBoundary: z.verificationStatus !== "REQUIRES_REVIEW",
      contractAreaLabel: z.contractArea
        ? `${z.contractArea.name} — ${z.contractArea.contractor?.name ?? "ללא קבלן"}`
        : null,
      streetCount: agg?._count ?? 0,
      segmentCount: z._count.segments,
      // Segment length is the honest figure once boundaries exist, since a
      // street crossing a boundary contributes only its part to each zone.
      totalLengthM: seg?._sum.lengthM ?? agg?._sum.lengthM ?? 0,
    };
  });

  const unassignedCount = streetsAgg.find((a) => a.zoneId === null)?._count ?? 0;
  const withoutBoundary = zoneRows.filter((z) => !z.hasBoundary).length;
  const withoutContractor = zoneRows.filter((z) => !z.contractAreaLabel).length;

  return (
    <div>
      <PageHeader
        title="אזורי ניקיון תפעוליים"
        subtitle={
          `${zones.length} אזורים · ${withoutBoundary} ללא גבול מוגדר · ` +
          `${withoutContractor} ללא שיוך לאזור מכרז · ${unassignedCount} רחובות ללא שיוך`
        }
      />
      <ZonesManager
        zones={zoneRows}
        unassignedCount={unassignedCount}
        withoutBoundary={withoutBoundary}
        canEdit={canEdit}
      />
    </div>
  );
}
