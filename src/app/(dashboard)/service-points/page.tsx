import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { ServicePointsManager } from "./service-points-manager";

export const dynamic = "force-dynamic";

export default async function ServicePointsPage() {
  const session = await auth();
  const canEdit = can(session?.user?.role, "servicePoints.manage");

  const [water, waste, zones, resourceTypes] = await Promise.all([
    prisma.waterRefillPoint.findMany({
      where: { active: true },
      include: { zone: { select: { id: true, name: true } }, allowedResourceTypes: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.wasteDisposalPoint.findMany({
      where: { active: true },
      include: { zone: { select: { id: true, name: true } }, allowedResourceTypes: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.operationalZone.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.resourceType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const brokenWater = water.filter((w) => w.status === "BROKEN").length;
  const needsReviewCount =
    water.filter((w) => w.status === "REQUIRES_REVIEW").length + waste.filter((w) => w.status === "REQUIRES_REVIEW").length;

  return (
    <div>
      <PageHeader
        title="נקודות מים ופריקת פסולת"
        subtitle={
          `${water.length} נקודות מים (${brokenWater} תקולות) · ${waste.length} נקודות פריקה · ` +
          `${needsReviewCount} ממתינות לאימות`
        }
      />
      <ServicePointsManager
        water={water.map((w) => ({
          id: w.id,
          name: w.name,
          lat: w.lat,
          lon: w.lon,
          address: w.address,
          zoneId: w.zoneId,
          zoneName: w.zone?.name ?? null,
          status: w.status,
          verificationStatus: w.verificationStatus,
          availabilityHours: w.availabilityHours as { day?: string; from: string; to: string }[] | null,
          connectionType: w.connectionType,
          flowLitersPerMin: w.flowLitersPerMin,
          avgFillMinutes: w.avgFillMinutes,
          avgWaitMinutes: w.avgWaitMinutes,
          parallelCapacity: w.parallelCapacity,
          maxVehicleWidthM: w.maxVehicleWidthM,
          maxVehicleHeightM: w.maxVehicleHeightM,
          contactName: w.contactName,
          contactPhone: w.contactPhone,
          lastCheckedAt: w.lastCheckedAt?.toISOString() ?? null,
          notes: w.notes,
          isDemo: w.isDemo,
          allowedResourceTypeIds: w.allowedResourceTypes.map((t) => t.id),
        }))}
        waste={waste.map((w) => ({
          id: w.id,
          name: w.name,
          lat: w.lat,
          lon: w.lon,
          address: w.address,
          zoneId: w.zoneId,
          zoneName: w.zone?.name ?? null,
          status: w.status,
          verificationStatus: w.verificationStatus,
          allowedWasteTypes: w.allowedWasteTypes,
          availabilityHours: w.availabilityHours as { day?: string; from: string; to: string }[] | null,
          avgDumpMinutes: w.avgDumpMinutes,
          avgWaitMinutes: w.avgWaitMinutes,
          maxVehicleWidthM: w.maxVehicleWidthM,
          maxVehicleHeightM: w.maxVehicleHeightM,
          accessNotes: w.accessNotes,
          notes: w.notes,
          isDemo: w.isDemo,
          allowedResourceTypeIds: w.allowedResourceTypes.map((t) => t.id),
        }))}
        zones={zones}
        resourceTypes={resourceTypes}
        canEdit={canEdit}
      />
    </div>
  );
}
