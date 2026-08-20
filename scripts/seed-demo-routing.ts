/**
 * Seeds the smart-cleaning demo dataset (§19): one zone, eight segments, a
 * vehicle with a defined water tank, two water points (one broken), one very
 * dirty segment, one segment with an access problem — all tagged `isDemo` /
 * prefixed "DEMO" so they can never be mistaken for real data and can be
 * removed cleanly with `npm run clear:demo-routing`.
 *
 *   npx tsx --env-file=.env scripts/seed-demo-routing.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { seedDemoRouting } from "@/server/demo/routingDemo";
import { isDemoModeEnabled } from "@/lib/env";

async function main() {
  if (!isDemoModeEnabled()) {
    throw new Error("DEMO_MODE אינו מופעל — הריצו עם DEMO_MODE=true בקובץ .env כדי לזרוע נתוני הדגמה.");
  }
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("לא נמצא משתמש ADMIN — הריצו npx tsx scripts/seed-admin.ts קודם");

  const result = await seedDemoRouting(admin.id);
  console.log("נתוני הדגמה נוצרו:");
  console.log(`  אזור: ${result.zoneId}`);
  console.log(`  ${result.streetIds.length} מקטעים`);
  console.log(`  כלי: ${result.resourceId}`);
  console.log(`  נקודות מים: ${result.waterPointIds.join(", ")}`);
  console.log("\nכעת ניתן ליצור תוכנית עבודה בתאריך היום עבור אזור ההדגמה במסך /plans.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
