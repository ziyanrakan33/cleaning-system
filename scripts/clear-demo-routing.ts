/**
 * Removes the smart-cleaning demo dataset (§19). Safe to run even if the demo
 * was never seeded, or partially seeded — every delete is scoped to
 * `isDemo: true` / the "DEMO" prefix, so it can never touch real data.
 *
 *   npx tsx --env-file=.env scripts/clear-demo-routing.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { clearDemoRouting } from "@/server/demo/routingDemo";

async function main() {
  await clearDemoRouting();
  console.log("נתוני ההדגמה נמחקו.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
