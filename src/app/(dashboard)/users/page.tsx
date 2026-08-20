import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  const [users, contractAreas] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, phone: true, contractAreaId: true },
    }),
    prisma.contractArea.findMany({ orderBy: { areaNumber: "asc" }, select: { id: true, name: true, areaNumber: true } }),
  ]);

  return (
    <div>
      <PageHeader title="משתמשים" subtitle="ניהול מנהלים, מבקרים ועובדים" />
      <UsersManager users={users} contractAreas={contractAreas} />
    </div>
  );
}
