import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { effectiveDeduction } from "@/server/defects/service";
import { DefectsManager } from "./defects-manager";

export const dynamic = "force-dynamic";

export default async function DefectsPage() {
  const session = await auth();
  if (!can(session?.user?.role, "defects.view")) redirect("/");

  const role = session!.user.role;
  const canCreate = can(role, "defects.create");
  const canSeeFinance = can(role, "finance.view");

  const [defects, defectTypes, zones, users] = await Promise.all([
    prisma.defect.findMany({
      orderBy: [{ dueAt: "asc" }, { reportedAt: "desc" }],
      take: 300,
      include: {
        defectType: { select: { name: true, category: true } },
        zone: { select: { name: true, color: true } },
        street: { select: { name: true } },
        contractArea: { select: { name: true, contractor: { select: { name: true } } } },
        assignedTo: { select: { name: true } },
        _count: { select: { photos: true } },
      },
    }),
    prisma.defectType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        unitBasis: true,
        deductionAmount: true,
        defaultFixHours: true,
      },
    }),
    prisma.operationalZone.findMany({
      where: { active: true },
      orderBy: { zoneNumber: "asc" },
      select: { id: true, name: true, code: true, color: true },
    }),
    prisma.user.findMany({
      where: { active: true, role: { in: ["SITE_SUPERVISOR", "CONTRACTOR_MANAGER"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const now = new Date();
  const rows = defects.map((d) => ({
    id: d.id,
    reference: d.reference,
    title: d.title,
    status: d.status,
    severity: d.severity,
    typeName: d.defectType?.name ?? null,
    category: d.defectType?.category ?? null,
    zoneName: d.zone?.name ?? null,
    zoneColor: d.zone?.color ?? null,
    streetName: d.street?.name ?? null,
    contractorName: d.contractArea?.contractor?.name ?? null,
    assignedToName: d.assignedTo?.name ?? null,
    reportedAt: d.reportedAt.toISOString(),
    dueAt: d.dueAt?.toISOString() ?? null,
    overdue: !!d.dueAt && d.dueAt < now && !["FIXED", "CLOSED", "REJECTED"].includes(d.status),
    photoCount: d._count.photos,
    deductionStatus: d.deductionStatus,
    deductionAmount: canSeeFinance ? effectiveDeduction(d) : null,
  }));

  const open = rows.filter((r) => !["CLOSED", "FIXED"].includes(r.status)).length;
  const overdue = rows.filter((r) => r.overdue).length;
  const awaitingDeduction = rows.filter((r) => r.deductionStatus === "PROPOSED").length;
  const approvedTotal = canSeeFinance
    ? rows
        .filter((r) => r.deductionStatus === "APPROVED" || r.deductionStatus === "APPLIED")
        .reduce((s, r) => s + (r.deductionAmount ?? 0), 0)
    : null;

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="ליקויים"
        subtitle={
          `${open} פתוחים · ${overdue} באיחור · ${awaitingDeduction} קיזוזים ממתינים לאישור` +
          (approvedTotal !== null ? ` · ${approvedTotal.toLocaleString("he-IL")} ₪ קיזוזים מאושרים` : "")
        }
      />
      <DefectsManager
        rows={rows}
        defectTypes={defectTypes.map((t) => ({
          ...t,
          deductionAmount: canSeeFinance ? Number(t.deductionAmount) : null,
        }))}
        zones={zones}
        assignees={users}
        canCreate={canCreate}
        canSeeFinance={canSeeFinance}
      />
    </div>
  );
}
