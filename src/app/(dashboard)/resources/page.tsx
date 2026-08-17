import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { ResourcesManager } from "./resources-manager";

export default async function ResourcesPage() {
  const session = await auth();
  const canEdit = can(session?.user?.role, "resources.edit");

  const [resourceTypes, resources, zones, employees] = await Promise.all([
    prisma.resourceType.findMany({ orderBy: { name: "asc" } }),
    prisma.resource.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      include: { resourceType: true, assignedEmployee: { select: { id: true, name: true } } },
    }),
    prisma.operationalZone.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true, role: "EMPLOYEE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="משאבים"
        subtitle={`${resources.length} משאבים פעילים · ${resourceTypes.length} סוגי משאב מוגדרים`}
        actions={
          canEdit ? (
            <a href="/resources/allocation" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground">
              המלצת חלוקת משאבים
            </a>
          ) : undefined
        }
      />
      <ResourcesManager
        resourceTypes={resourceTypes.map((t) => ({ id: t.id, name: t.name, code: t.code }))}
        resources={resources.map((r) => ({
          id: r.id,
          identifier: r.identifier,
          name: r.name,
          typeName: r.resourceType.name,
          status: r.status,
          assignedEmployeeId: r.assignedEmployee?.id ?? null,
          assignedEmployeeName: r.assignedEmployee?.name ?? null,
          workHoursStart: r.workHoursStart,
          workHoursEnd: r.workHoursEnd,
        }))}
        zones={zones.map((z) => ({ id: z.id, name: z.name }))}
        employees={employees}
        canEdit={canEdit}
      />
    </div>
  );
}
