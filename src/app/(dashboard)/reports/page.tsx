import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { ReportsIndex } from "./reports-index";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");

  const [zones, contractAreas, resources, workers] = await Promise.all([
    prisma.operationalZone.findMany({
      where: { active: true },
      orderBy: { zoneNumber: "asc" },
      select: { id: true, name: true },
    }),
    prisma.contractArea.findMany({
      include: { contractor: { select: { name: true } } },
      orderBy: { areaNumber: "asc" },
    }),
    prisma.resource.findMany({
      where: { active: true },
      orderBy: { identifier: "asc" },
      select: { id: true, identifier: true, name: true, resourceType: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { active: true, role: { in: ["EMPLOYEE", "SITE_SUPERVISOR"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <PageHeader title="דוחות" subtitle="הפקת דוחות והפקה ל-Excel/CSV/הדפסה/PDF" />
      <ReportsIndex
        zones={zones}
        contractAreas={contractAreas.map((a) => ({ id: a.id, label: `${a.name} — ${a.contractor?.name ?? "ללא קבלן"}` }))}
        resources={resources.map((r) => ({ id: r.id, label: `${r.resourceType.name} ${r.identifier}${r.name ? " · " + r.name : ""}` }))}
        workers={workers}
        canSeeFinance={can(session!.user.role, "finance.view")}
      />
    </div>
  );
}
