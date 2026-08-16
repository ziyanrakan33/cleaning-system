import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@kfar-saba-cleaning.local";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log("Admin user already exists:", EMAIL);
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.user.create({
    data: {
      name: "מנהל מערכת",
      email: EMAIL,
      passwordHash,
      role: "ADMIN",
      active: true,
    },
  });

  console.log("Created admin user:");
  console.log("  email:   ", admin.email);
  console.log("  password:", PASSWORD, "(change this after first login)");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
