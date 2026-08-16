import { prisma } from "@/lib/prisma";
import { generateWorkPlan } from "@/server/scheduling/engine";
import { todayDateOnly } from "@/server/dateUtils";

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("no admin");

  const start = Date.now();
  const result = await generateWorkPlan(todayDateOnly(), admin.id);
  const elapsed = Date.now() - start;

  console.log(JSON.stringify(result, null, 2));
  console.log(`\nGenerated in ${elapsed}ms`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
