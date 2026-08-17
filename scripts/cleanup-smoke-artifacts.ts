/**
 * Removes the throwaway zone the browser smoke test creates, then recomputes
 * the spatial join so the database is left as it was found.
 *
 * Scoped deliberately narrowly — it only ever touches zones whose code carries
 * the smoke prefix, so it can never wipe a boundary a manager actually drew.
 *
 *   npx tsx --env-file=.env scripts/cleanup-smoke-artifacts.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { runSpatialJoin } from "@/server/geo/spatialJoin";

export const SMOKE_ZONE_PREFIX = "__SMOKE__";

async function main() {
  const zones = await prisma.operationalZone.findMany({
    where: { code: { startsWith: SMOKE_ZONE_PREFIX } },
    select: { id: true, code: true, name: true },
  });

  if (zones.length === 0) {
    console.log("לא נמצאו שאריות מבדיקת עשן.");
  } else {
    const ids = zones.map((z) => z.id);
    await prisma.streetSegment.deleteMany({ where: { zoneId: { in: ids } } });
    await prisma.street.updateMany({
      where: { zoneId: { in: ids } },
      data: { zoneId: null, crossesZones: false },
    });
    await prisma.sourceEvidence.deleteMany({
      where: { entityType: "OperationalZone", entityId: { in: ids } },
    });
    await prisma.manualOverride.deleteMany({
      where: { entityType: "OperationalZone", entityId: { in: ids } },
    });
    await prisma.auditLog.deleteMany({
      where: { entityType: "OperationalZone", entityId: { in: ids } },
    });
    await prisma.operationalZone.deleteMany({ where: { id: { in: ids } } });
    console.log(`נמחקו ${zones.length} אזורי בדיקה: ${zones.map((z) => z.code).join(", ")}`);
  }

  const result = await runSpatialJoin();
  console.log(
    `השיוך חושב מחדש: ${result.segmentsCreated} מקטעים · ${result.streetsAssigned} רחובות משויכים · ` +
      `${result.zonesWithGeometry} אזורים עם גבול`
  );
}

main()
  .catch((e) => {
    console.error("הניקוי נכשל:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
