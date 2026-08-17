import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { pickResourcesForAllocation } from "@/server/resources/allocationEngine";
import { QuotaExceededError, setResourceZones } from "@/server/resources/service";
import { audit } from "@/server/audit";

const bodySchema = z.object({
  contractAreaId: z.string(),
  resourceTypeId: z.string(),
  /** zoneId -> suggested (or manager-edited) quantity. */
  quantities: z.record(z.string(), z.number().int().min(0)),
  /** Required only when the total requested exceeds the contracted quantity. */
  reason: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "resources.transfer")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { contractAreaId, resourceTypeId, quantities, reason } = parsed.data;

  const quota = await prisma.contractAreaResourceQuota.findFirst({
    where: { contractAreaId, resourceTypeId },
    include: { resourceType: { select: { name: true } }, contractArea: { select: { name: true } } },
  });
  if (!quota) {
    return NextResponse.json({ error: "לא נמצאה הקצאה חוזית לסוג משאב זה באזור מכרז זה" }, { status: 404 });
  }

  const totalRequested = Object.values(quantities).reduce((a, b) => a + b, 0);
  if (totalRequested > quota.quantity && !reason) {
    return NextResponse.json(
      {
        error: "quota_exceeded",
        message: `הכמות המבוקשת (${totalRequested}) חורגת מהכמות החוזית (${quota.quantity}) עבור ${quota.resourceType.name} ב${quota.contractArea.name}. יש לספק נימוק כדי להמשיך.`,
        contractedQuantity: quota.quantity,
        totalRequested,
      },
      { status: 409 }
    );
  }

  const zoneAssignments = await pickResourcesForAllocation(contractAreaId, resourceTypeId, quantities);

  // Free every resource in the pool that this repartition doesn't place
  // anywhere, so a reduced quantity actually releases units back to the free
  // pool instead of leaving them pinned to a zone that no longer wants them.
  const areaZones = await prisma.operationalZone.findMany({ where: { contractAreaId }, select: { id: true } });
  const areaZoneIds = areaZones.map((z) => z.id);
  const allPoolResources = await prisma.resource.findMany({
    where: { active: true, resourceTypeId, allowedZones: { every: { id: { in: areaZoneIds } } } },
    select: { id: true },
  });
  const placedIds = new Set(zoneAssignments.flatMap((a) => a.resourceIds));
  const toFree = allPoolResources.filter((r) => !placedIds.has(r.id));

  const applied: { zoneId: string; resourceIds: string[] }[] = [];
  const shortfalls: { zoneId: string; requested: number; placed: number }[] = [];

  try {
    for (const { zoneId, resourceIds } of zoneAssignments) {
      for (const resourceId of resourceIds) {
        await setResourceZones({ resourceId, zoneIds: [zoneId], userId: session.user.id, overrideReason: reason, source: "ALLOCATION_RECOMMENDATION" });
      }
      applied.push({ zoneId, resourceIds });
      const requested = quantities[zoneId] ?? 0;
      if (resourceIds.length < requested) {
        shortfalls.push({ zoneId, requested, placed: resourceIds.length });
      }
    }
    for (const r of toFree) {
      await setResourceZones({ resourceId: r.id, zoneIds: [], userId: session.user.id, source: "ALLOCATION_RECOMMENDATION" });
    }
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: "quota_exceeded", message: err.message, details: err.details }, { status: 409 });
    }
    throw err;
  }

  await audit({
    entityType: "ContractArea",
    entityId: contractAreaId,
    action: "APPLY_ALLOCATION_RECOMMENDATION",
    userId: session.user.id,
    after: { resourceTypeId, quantities, freed: toFree.length },
    description: `הקצאת ${quota.resourceType.name} ב${quota.contractArea.name} חושבה מחדש ויושמה על ${applied.length} אזורים`,
  });

  return NextResponse.json({
    ok: true,
    applied,
    freedCount: toFree.length,
    shortfalls,
    poolTooSmall: shortfalls.length > 0 && shortfalls.some((s) => s.placed < s.requested),
  });
}
