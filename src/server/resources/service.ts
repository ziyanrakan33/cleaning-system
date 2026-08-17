import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";

export class QuotaExceededError extends Error {
  constructor(readonly details: QuotaCheckResult[]) {
    super("ההקצאה חורגת מהכמות החוזית");
  }
}

export type QuotaCheckResult = {
  contractAreaId: string;
  contractAreaName: string;
  resourceTypeName: string;
  contractedQuantity: number;
  currentCount: number;
  wouldBeCount: number;
};

/**
 * Checks whether assigning `resourceId` to `newZoneIds` would push the count of
 * active resources of its type, already working any zone under a given
 * contract area, past that area's contracted quantity for the type.
 *
 * A resource can only belong to one type, but its new zone list may span more
 * than one contract area (unusual, but not forbidden), so this returns one
 * result per contract area actually touched — not just the first one.
 */
export async function checkQuotaForAssignment(resourceId: string, newZoneIds: string[]): Promise<QuotaCheckResult[]> {
  if (newZoneIds.length === 0) return [];

  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { resourceTypeId: true, resourceType: { select: { name: true } } },
  });
  if (!resource) return [];

  const zones = await prisma.operationalZone.findMany({
    where: { id: { in: newZoneIds } },
    select: { id: true, contractAreaId: true },
  });
  const contractAreaIds = [...new Set(zones.map((z) => z.contractAreaId).filter((id): id is string => !!id))];
  if (contractAreaIds.length === 0) return [];

  const results: QuotaCheckResult[] = [];
  for (const contractAreaId of contractAreaIds) {
    const [quota, area, zonesInArea] = await Promise.all([
      prisma.contractAreaResourceQuota.findFirst({
        where: { contractAreaId, resourceTypeId: resource.resourceTypeId },
        select: { quantity: true },
      }),
      prisma.contractArea.findUnique({ where: { id: contractAreaId }, select: { name: true } }),
      prisma.operationalZone.findMany({ where: { contractAreaId }, select: { id: true } }),
    ]);
    if (!quota) continue; // Nothing contracted for this type in this area — no ceiling to check.

    const zoneIdsInArea = zonesInArea.map((z) => z.id);
    const currentCount = await prisma.resource.count({
      where: {
        id: { not: resourceId },
        resourceTypeId: resource.resourceTypeId,
        active: true,
        allowedZones: { some: { id: { in: zoneIdsInArea } } },
      },
    });
    const wouldBeCount = currentCount + 1;
    if (wouldBeCount > quota.quantity) {
      results.push({
        contractAreaId,
        contractAreaName: area?.name ?? contractAreaId,
        resourceTypeName: resource.resourceType.name,
        contractedQuantity: quota.quantity,
        currentCount,
        wouldBeCount,
      });
    }
  }
  return results;
}

/**
 * Sets a resource's zone restriction, enforcing the §-driven rule from the
 * tender workflow: an allocation beyond the contracted quantity is never
 * silently blocked, but it does require an explicit reason and is recorded
 * with who approved it and when (ManualOverride + AuditLog), exactly like
 * every other override in this system.
 */
export async function setResourceZones(opts: {
  resourceId: string;
  zoneIds: string[];
  userId: string;
  /** Present only when the caller has already seen and accepted a quota warning. */
  overrideReason?: string;
  source: "MANUAL" | "ALLOCATION_RECOMMENDATION";
}) {
  const overQuota = await checkQuotaForAssignment(opts.resourceId, opts.zoneIds);
  if (overQuota.length > 0 && !opts.overrideReason) {
    throw new QuotaExceededError(overQuota);
  }

  const before = await prisma.resource.findUnique({
    where: { id: opts.resourceId },
    select: { allowedZones: { select: { id: true, name: true } } },
  });

  const resource = await prisma.resource.update({
    where: { id: opts.resourceId },
    data: { allowedZones: { set: opts.zoneIds.map((id) => ({ id })) } },
    include: { allowedZones: { select: { id: true, name: true } } },
  });

  if (overQuota.length > 0) {
    await prisma.manualOverride.create({
      data: {
        entityType: "Resource",
        entityId: opts.resourceId,
        fieldName: "allowedZones",
        previousValue: before?.allowedZones.map((z) => z.name).join(", ") || "(ללא)",
        newValue: resource.allowedZones.map((z) => z.name).join(", ") || "(ללא)",
        reason: opts.overrideReason ?? null,
        overriddenById: opts.userId,
      },
    });
  }

  await audit({
    entityType: "Resource",
    entityId: opts.resourceId,
    action: opts.source === "ALLOCATION_RECOMMENDATION" ? "APPLY_ALLOCATION_RECOMMENDATION" : "SET_ALLOWED_ZONES",
    userId: opts.userId,
    before: { zones: before?.allowedZones.map((z) => z.name) ?? [] },
    after: { zones: resource.allowedZones.map((z) => z.name) },
    description: overQuota.length > 0 ? `שיוך אזורים עודכן, בחריגה מהכמות החוזית: ${opts.overrideReason}` : "שיוך אזורים עודכן",
  });

  return resource;
}
