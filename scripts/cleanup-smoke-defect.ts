/**
 * Removes the defect the browser smoke test creates (title prefixed
 * "__SMOKE_DEFECT__" / notes prefixed "__SMOKE__"), so a smoke run leaves no
 * fabricated defect behind.
 *
 *   npx tsx --env-file=.env scripts/cleanup-smoke-defect.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";

async function main() {
  const defects = await prisma.defect.findMany({
    where: { title: { startsWith: "__SMOKE_DEFECT__" } },
    select: { id: true, reference: true },
  });

  if (defects.length === 0) {
    console.log("לא נמצאו שאריות ליקוי מבדיקת עשן.");
    return;
  }

  const ids = defects.map((d) => d.id);
  await prisma.defectPhoto.deleteMany({ where: { defectId: { in: ids } } });
  await prisma.defectEvent.deleteMany({ where: { defectId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { entityType: "Defect", entityId: { in: ids } } });
  await prisma.defect.deleteMany({ where: { id: { in: ids } } });

  console.log(`נמחקו ${defects.length} ליקויי בדיקה: ${defects.map((d) => d.reference).join(", ")}`);
}

main()
  .catch((e) => {
    console.error("הניקוי נכשל:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
