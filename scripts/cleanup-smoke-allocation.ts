/**
 * Removes the throwaway zone/contractor/resource-type/resources the browser
 * smoke test creates via direct API calls, so a run leaves no fabricated data
 * behind.
 *
 *   npx tsx --env-file=.env scripts/cleanup-smoke-allocation.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";

const TAG = "__SMOKE_ALLOC__";

async function main() {
  const zones = await prisma.operationalZone.findMany({ where: { code: { startsWith: TAG } }, select: { id: true } });
  const zoneIds = zones.map((z) => z.id);
  const streets = await prisma.street.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const streetIds = streets.map((s) => s.id);

  await prisma.streetSegment.deleteMany({ where: { streetId: { in: streetIds } } });
  await prisma.street.deleteMany({ where: { id: { in: streetIds } } });

  const resources = await prisma.resource.findMany({ where: { identifier: { startsWith: TAG } }, select: { id: true } });
  const resourceIds = resources.map((r) => r.id);
  await prisma.manualOverride.deleteMany({ where: { entityType: "Resource", entityId: { in: resourceIds } } });
  await prisma.auditLog.deleteMany({ where: { entityType: "Resource", entityId: { in: resourceIds } } });
  await prisma.resource.deleteMany({ where: { id: { in: resourceIds } } });

  await prisma.contractAreaResourceQuota.deleteMany({ where: { contractArea: { name: { startsWith: TAG } } } });
  await prisma.resourceType.deleteMany({ where: { code: { startsWith: TAG } } });

  const areas = await prisma.contractArea.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityType: "ContractArea", entityId: { in: areas.map((a) => a.id) } } });
  await prisma.operationalZone.deleteMany({ where: { id: { in: zoneIds } } });
  await prisma.contractArea.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.contractor.deleteMany({ where: { name: { startsWith: TAG } } });

  console.log(`נוקו: ${zoneIds.length} אזורים, ${streetIds.length} רחובות, ${resourceIds.length} משאבים, ${areas.length} אזורי מכרז`);
}

main()
  .catch((e) => {
    console.error("הניקוי נכשל:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
