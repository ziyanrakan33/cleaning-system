/**
 * Creates one demo user per tender role that the defect module needs to be
 * exercised end-to-end (inspector, contractor manager, site supervisor,
 * department head, finance). Idempotent — running twice does not duplicate.
 *
 * These are operational test accounts, not production users. Real accounts
 * for real people are created through /users by an admin.
 *
 *   npx tsx --env-file=.env scripts/seed-demo-roles.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo1234!";

const DEMO_USERS = [
  { email: "inspector1@kfar-saba-cleaning.local", name: "מפקח אזורי", role: "INSPECTOR" as const },
  { email: "deptmanager1@kfar-saba-cleaning.local", name: "מנהל אגף חזות העיר", role: "DEPT_MANAGER" as const },
  { email: "contractor1@kfar-saba-cleaning.local", name: "נציג שלג לבן (1986) בע\"מ", role: "CONTRACTOR_MANAGER" as const },
  { email: "contractor2@kfar-saba-cleaning.local", name: "נציג פרח השקד בע\"מ", role: "CONTRACTOR_MANAGER" as const },
  { email: "supervisor1@kfar-saba-cleaning.local", name: "מנהל עבודה אזורי", role: "SITE_SUPERVISOR" as const },
  { email: "finance1@kfar-saba-cleaning.local", name: "גזברות", role: "FINANCE" as const },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  let created = 0;

  for (const u of DEMO_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`  · ${u.email} כבר קיים`);
      continue;
    }
    await prisma.user.create({
      data: { name: u.name, email: u.email, passwordHash, role: u.role, active: true },
    });
    created++;
    console.log(`  ✓ ${u.role.padEnd(18)} ${u.email}`);
  }

  console.log(`\n${created} משתמשי דמו נוצרו. סיסמה לכולם: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error("הזריעה נכשלה:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
