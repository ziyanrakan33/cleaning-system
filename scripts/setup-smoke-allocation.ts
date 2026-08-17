/**
 * Creates a throwaway zone with a real StreetSegment, a contract area, a
 * resource type + quota, and one resource — the minimum fixture needed for
 * the browser smoke test to see a real, nonzero recommendation. StreetSegment
 * rows have no creation API (they only ever come from the spatial join), so
 * this has to go through Prisma directly rather than through the app's API,
 * unlike the rest of the smoke fixtures in this project.
 *
 * Prints the created ids as JSON on stdout for the .mjs smoke test to consume.
 * Paired with scripts/cleanup-smoke-allocation.ts.
 *
 *   npx tsx --env-file=.env scripts/setup-smoke-allocation.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";

const TAG = "__SMOKE_ALLOC__";

async function main() {
  const contractor = await prisma.contractor.create({ data: { name: `${TAG} קבלן` } });
  const area = await prisma.contractArea.create({ data: { areaNumber: 951, name: `${TAG} אזור מכרז`, contractorId: contractor.id } });
  const zone = await prisma.operationalZone.create({
    data: { code: `${TAG}Z`, name: `${TAG} אזור`, color: "#000", contractAreaId: area.id },
  });
  const rt = await prisma.resourceType.create({
    data: { code: `${TAG}RT`, name: `${TAG} סוג משאב`, suitableForRoad: true },
  });
  const street = await prisma.street.create({
    data: { name: `${TAG} רחוב`, zoneId: zone.id, priority: "HIGH", cleaningFrequency: { type: "DAILY" }, source: "MANUAL" },
  });
  await prisma.streetSegment.create({ data: { streetId: street.id, zoneId: zone.id, segmentIndex: 0, lengthM: 2000 } });
  const resource = await prisma.resource.create({ data: { resourceTypeId: rt.id, identifier: `${TAG}R1` } });
  await prisma.contractAreaResourceQuota.create({
    data: { contractAreaId: area.id, resourceTypeId: rt.id, lineNumber: 1, quantity: 1, shiftHours: 8 },
  });

  console.log(JSON.stringify({ contractAreaId: area.id, zoneId: zone.id, resourceTypeId: rt.id, resourceId: resource.id }));
}

main()
  .catch((e) => {
    console.error("ההכנה נכשלה:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
