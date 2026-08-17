import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { ComplaintsManager } from "./complaints-manager";

export const dynamic = "force-dynamic";

export default async function ComplaintsPage() {
  const session = await auth();
  if (!can(session?.user?.role, "complaints.manage")) redirect("/");

  const [complaints, zones] = await Promise.all([
    prisma.complaint.findMany({
      orderBy: [{ receivedAt: "desc" }],
      take: 300,
      include: {
        zone: { select: { name: true, color: true } },
        street: { select: { name: true } },
        receivedBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
        _count: { select: { defects: true } },
      },
    }),
    prisma.operationalZone.findMany({
      where: { active: true },
      orderBy: { zoneNumber: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const now = new Date();
  const rows = complaints.map((c) => ({
    id: c.id,
    reference: c.reference,
    subject: c.subject,
    description: c.description,
    status: c.status,
    zoneName: c.zone?.name ?? null,
    zoneColor: c.zone?.color ?? null,
    streetName: c.street?.name ?? null,
    reporterName: c.reporterName,
    reporterPhone: c.reporterPhone,
    receivedAt: c.receivedAt.toISOString(),
    dueAt: c.dueAt?.toISOString() ?? null,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    resolution: c.resolution,
    receivedByName: c.receivedBy.name,
    assignedToName: c.assignedTo?.name ?? null,
    defectCount: c._count.defects,
    overdue:
      !!c.dueAt && c.dueAt < now && !["RESOLVED", "CLOSED", "REJECTED"].includes(c.status),
  }));

  const open = rows.filter((r) => !["RESOLVED", "CLOSED", "REJECTED"].includes(r.status)).length;

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="תלונות ופניות מוקד"
        subtitle={`${open} פתוחות מתוך ${rows.length} · §640 מחייב את הקבלן לברר ולטפל בכל תלונה`}
      />
      <ComplaintsManager rows={rows} zones={zones} />
    </div>
  );
}
