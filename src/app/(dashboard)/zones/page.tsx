import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ZonesManager } from "./zones-manager";

export default async function ZonesPage() {
  const zones = await prisma.zone.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    include: { _count: { select: { streets: true } } },
  });

  const streetsAgg = await prisma.street.groupBy({
    by: ["zoneId"],
    where: { active: true },
    _count: true,
    _sum: { lengthM: true },
  });

  const zoneRows = zones.map((z) => {
    const agg = streetsAgg.find((a) => a.zoneId === z.id);
    return {
      id: z.id,
      name: z.name,
      code: z.code,
      color: z.color,
      description: z.description,
      streetCount: agg?._count ?? 0,
      totalLengthM: agg?._sum.lengthM ?? 0,
    };
  });

  const unassignedCount = streetsAgg.find((a) => a.zoneId === null)?._count ?? 0;

  return (
    <div>
      <PageHeader
        title="אזורי עבודה"
        subtitle={`${zones.length} אזורים מוגדרים מתוך 10 מתוכננים · ${unassignedCount} רחובות עדיין ללא שיוך`}
      />
      <ZonesManager zones={zoneRows} unassignedCount={unassignedCount} />
    </div>
  );
}
