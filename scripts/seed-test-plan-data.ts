/**
 * Dev/test seed: assigns real imported streets that fall inside the
 * existing "מרכז העיר" test zone (drawn during QA) to that zone, and
 * creates two test resources, so the scheduling engine has something
 * real to work with for verification. Not meant as production data —
 * the admin's real 10-zone plan replaces this via the UI.
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const zone = await prisma.operationalZone.findFirst({ where: { code: "Z01" } });
  if (!zone) throw new Error("Zone Z01 not found — run the zone boundary smoke test first.");

  const inZone = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id FROM streets s
    JOIN zones z ON ST_Contains(z.geometry, ST_LineInterpolatePoint(s.geometry, 0.5))
    WHERE z.id = ${zone.id} AND s.active = true
  `;
  console.log(`${inZone.length} streets fall inside zone ${zone.name}.`);

  await prisma.street.updateMany({
    where: { id: { in: inZone.map((s) => s.id) } },
    data: { zoneId: zone.id },
  });

  let resourceType = await prisma.resourceType.findFirst({ where: { code: "SWEEPER" } });
  if (!resourceType) {
    resourceType = await prisma.resourceType.create({ data: { name: "מכונת טיאוט", code: "SWEEPER" } });
  }

  for (const identifier of ["01", "02"]) {
    const existing = await prisma.resource.findFirst({ where: { resourceTypeId: resourceType.id, identifier } });
    if (existing) {
      await prisma.resource.update({
        where: { id: existing.id },
        data: { allowedZones: { set: [{ id: zone.id }] }, status: "ACTIVE", workHoursStart: "07:00", workHoursEnd: "14:30" },
      });
      continue;
    }
    await prisma.resource.create({
      data: {
        resourceTypeId: resourceType.id,
        identifier,
        status: "ACTIVE",
        workHoursStart: "07:00",
        workHoursEnd: "14:30",
        allowedZones: { connect: [{ id: zone.id }] },
      },
    });
  }

  console.log("Seeded 2 test sweeper resources allowed in zone", zone.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
