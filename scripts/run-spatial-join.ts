/**
 * Recomputes street→zone assignment from the zone boundaries currently in the
 * database. Safe to re-run; hand-corrected streets are left alone.
 *
 *   npx tsx --env-file=.env scripts/run-spatial-join.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { runSpatialJoin } from "@/server/geo/spatialJoin";

async function main() {
  const started = Date.now();
  const r = await runSpatialJoin();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (r.zonesWithGeometry === 0) {
    console.log("לא הוגדר גבול גיאוגרפי לאף אזור — אין מה לשייך.");
    console.log(`${r.zonesWithoutGeometry} אזורים ממתינים לגבול.`);
    console.log("\nהגדירו גבול במסך האזורים (ציור על המפה או ייבוא GeoJSON/KML) והריצו שוב.");
    return;
  }

  console.log(`השיוך הגיאוגרפי הסתיים ב-${seconds} שניות\n`);
  console.log(`  אזורים עם גבול מוגדר      ${r.zonesWithGeometry}`);
  console.log(`  אזורים ללא גבול            ${r.zonesWithoutGeometry}`);
  console.log(`  רחובות עם גיאומטריה        ${r.streetsWithGeometry}`);
  console.log(`  מקטעים שנוצרו              ${r.segmentsCreated}`);
  console.log(`  רחובות ששויכו              ${r.streetsAssigned}`);
  console.log(`  רחובות שחוצים אזורים       ${r.streetsCrossingZones}`);
  console.log(`  רחובות ללא שיוך            ${r.streetsUnassigned}`);
  console.log(`  מקטעים הדורשים בדיקה       ${r.segmentsRequiringReview}`);
  console.log(`  רחובות מוגנים (תיקון ידני) ${r.protectedStreets}`);

  console.log("\nכיסוי לפי אזור:");
  console.log("  אזור         רחובות  שבילים  מקטעים      ק\"מ");
  let totalKm = 0;
  for (const z of r.coverage) {
    const km = z.lengthM / 1000;
    totalKm += km;
    console.log(
      `  ${z.name.padEnd(12)} ${String(z.streets).padStart(6)}  ${String(z.paths).padStart(6)}  ` +
        `${String(z.segments).padStart(7)}  ${km.toFixed(1).padStart(7)}`
    );
  }
  console.log(`  ${"סה\"כ".padEnd(12)} ${"".padStart(6)}  ${"".padStart(6)}  ${"".padStart(7)}  ${totalKm.toFixed(1).padStart(7)}`);

  const tender = await prisma.tender.findFirst({ select: { totalInfrastructureKm: true } });
  if (tender?.totalInfrastructureKm) {
    const diff = tender.totalInfrastructureKm - totalKm;
    console.log(
      `\nאומדן המכרז: ${tender.totalInfrastructureKm} ק"מ · משויך בפועל: ${totalKm.toFixed(1)} ק"מ · פער: ${diff.toFixed(1)} ק"מ`
    );
    if (Math.abs(diff) > 5) {
      console.log('הפער נשמר כסתירה בין מקורות ומוצג במסך המקורות — אין להתעלם ממנו.');
    }
  }
}

main()
  .catch((e) => {
    console.error("השיוך נכשל:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
