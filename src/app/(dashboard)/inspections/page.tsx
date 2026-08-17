import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { todayDateOnly } from "@/server/dateUtils";
import { InspectionsManager } from "./inspections-manager";

export const dynamic = "force-dynamic";

export default async function InspectionsPage() {
  const session = await auth();
  if (!can(session?.user?.role, "defects.view")) redirect("/");

  const canManage = can(session!.user.role, "inspections.manage");
  const today = todayDateOnly();

  const [inspections, zones, contractorReps] = await Promise.all([
    prisma.inspection.findMany({
      where: { date: today },
      orderBy: [{ round: "asc" }, { createdAt: "asc" }],
      include: {
        zone: { select: { name: true, code: true, color: true } },
        inspector: { select: { name: true } },
        contractorRep: { select: { name: true } },
        _count: { select: { defects: true } },
      },
    }),
    prisma.operationalZone.findMany({
      where: { active: true },
      orderBy: { zoneNumber: "asc" },
      select: { id: true, name: true, code: true, color: true, contractAreaId: true },
    }),
    prisma.user.findMany({
      where: { active: true, role: "CONTRACTOR_MANAGER" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows = inspections.map((i) => ({
    id: i.id,
    date: i.date.toISOString(),
    round: i.round,
    zoneName: i.zone?.name ?? null,
    zoneColor: i.zone?.color ?? null,
    inspectorName: i.inspector.name,
    contractorRepName: i.contractorRep?.name ?? null,
    status: i.status,
    meetingPoint: i.meetingPoint,
    startedAt: i.startedAt?.toISOString() ?? null,
    completedAt: i.completedAt?.toISOString() ?? null,
    notes: i.notes,
    defectCount: i._count.defects,
  }));

  const zonesWithoutTour = zones.filter(
    (z) => !rows.some((r) => r.zoneName === z.name)
  ).length;

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="סיורי פיקוח"
        subtitle={
          `${rows.length} סיורים היום · ${zonesWithoutTour} אזורים ללא סיור מתוכנן · ` +
          "§561: שתי פעימות יומיות, 10:00 ו-12:00, בנוכחות מנהל העבודה מטעם הקבלן"
        }
      />
      <InspectionsManager
        rows={rows}
        zones={zones.map((z) => ({ id: z.id, name: z.name, code: z.code, color: z.color }))}
        contractorReps={contractorReps}
        canManage={canManage}
      />
    </div>
  );
}
