import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, phone: true },
  });

  return (
    <div>
      <PageHeader title="משתמשים" subtitle="ניהול מנהלים, מבקרים ועובדים" />
      <UsersManager users={users} />
    </div>
  );
}
