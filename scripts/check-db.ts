import { prisma } from "@/lib/prisma";

async function main() {
  const userCount = await prisma.user.count();
  console.log("Connected. User count:", userCount);

  const indexes = await prisma.$queryRaw<{ indexname: string; tablename: string }[]>`
    SELECT indexname::text as indexname, tablename::text as tablename FROM pg_indexes
    WHERE indexname IN ('zones_geometry_gist_idx', 'streets_geometry_gist_idx')
  `;
  console.log("Spatial indexes:", indexes);
}

main()
  .catch((e) => {
    console.error("DB check failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
