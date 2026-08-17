import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { SourcesManager } from "./sources-manager";

export const dynamic = "force-dynamic";

/**
 * Resolves human labels for the polymorphic SourceEvidence rows, so the screen
 * shows "אזור מכרז 1 · שיוך קבלן" rather than a table name and a cuid.
 */
async function buildEntityLabels(rows: { entityType: string; entityId: string }[]) {
  const byType = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byType.has(r.entityType)) byType.set(r.entityType, new Set());
    byType.get(r.entityType)!.add(r.entityId);
  }
  const labels = new Map<string, string>();
  const key = (t: string, i: string) => `${t}:${i}`;

  const ids = (t: string) => [...(byType.get(t) ?? [])];

  const [tenders, areas, zones, types, quotas] = await Promise.all([
    prisma.tender.findMany({ where: { id: { in: ids("Tender") } }, select: { id: true, name: true } }),
    prisma.contractArea.findMany({
      where: { id: { in: ids("ContractArea") } },
      select: { id: true, name: true, contractor: { select: { name: true } } },
    }),
    prisma.operationalZone.findMany({
      where: { id: { in: ids("OperationalZone") } },
      select: { id: true, name: true, code: true },
    }),
    prisma.resourceType.findMany({
      where: { id: { in: ids("ResourceType") } },
      select: { id: true, name: true, code: true },
    }),
    prisma.contractAreaResourceQuota.findMany({
      where: { id: { in: ids("ContractAreaResourceQuota") } },
      select: {
        id: true,
        lineNumber: true,
        resourceType: { select: { name: true } },
        contractArea: { select: { name: true } },
      },
    }),
  ]);

  for (const t of tenders) labels.set(key("Tender", t.id), t.name);
  for (const a of areas) {
    labels.set(key("ContractArea", a.id), `${a.name}${a.contractor ? ` — ${a.contractor.name}` : ""}`);
  }
  for (const z of zones) labels.set(key("OperationalZone", z.id), `${z.name} (${z.code})`);
  for (const t of types) labels.set(key("ResourceType", t.id), `${t.name} [${t.code}]`);
  for (const q of quotas) {
    labels.set(
      key("ContractAreaResourceQuota", q.id),
      `${q.contractArea.name} · שורה ${q.lineNumber} · ${q.resourceType.name}`
    );
  }
  return labels;
}

export default async function SourcesPage() {
  const session = await auth();
  if (!can(session?.user?.role, "sources.view")) {
    redirect("/");
  }
  const canVerify = can(session?.user?.role, "sources.verify");
  const canAssign = can(session?.user?.role, "zones.assignContractArea");
  const canSeeFinance = can(session?.user?.role, "finance.view");

  const [evidenceRaw, conflicts, zones, contractAreas, segmentsRaw, streetStats] = await Promise.all([
    prisma.sourceEvidence.findMany({
      orderBy: [{ verificationStatus: "asc" }, { entityType: "asc" }, { createdAt: "asc" }],
      include: { verifiedBy: { select: { name: true } } },
    }),
    prisma.sourceConflict.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      include: { resolvedBy: { select: { name: true } } },
    }),
    prisma.operationalZone.findMany({
      where: { active: true },
      orderBy: [{ zoneNumber: "asc" }, { code: "asc" }],
      include: {
        contractArea: { select: { id: true, name: true, contractor: { select: { name: true } } } },
        _count: { select: { streets: true, segments: true } },
      },
    }),
    prisma.contractArea.findMany({
      orderBy: { areaNumber: "asc" },
      include: { contractor: { select: { name: true } }, _count: { select: { quotas: true } } },
    }),
    prisma.streetSegment.findMany({
      where: { verificationStatus: "REQUIRES_REVIEW" },
      take: 200,
      orderBy: { lengthM: "asc" },
      include: {
        street: { select: { name: true, type: true } },
        zone: { select: { name: true, code: true, color: true } },
      },
    }),
    prisma.street.groupBy({
      by: ["zoneId"],
      where: { active: true },
      _count: true,
      _sum: { lengthM: true },
    }),
  ]);

  const labels = await buildEntityLabels(evidenceRaw);

  const evidence = evidenceRaw.map((e) => ({
    id: e.id,
    entityType: e.entityType,
    entityLabel: labels.get(`${e.entityType}:${e.entityId}`) ?? "(רשומה נמחקה)",
    fieldName: e.fieldName,
    sourceFile: e.sourceFile,
    sourceType: e.sourceType,
    sourceSection: e.sourceSection,
    sourceImageRegion: e.sourceImageRegion,
    extractedValue: e.extractedValue,
    confidence: e.confidence,
    verificationStatus: e.verificationStatus,
    verifiedByName: e.verifiedBy?.name ?? null,
    verifiedAt: e.verifiedAt?.toISOString() ?? null,
    notes: e.notes,
  }));

  const segments = segmentsRaw.map((s) => ({
    id: s.id,
    streetName: s.street.name,
    streetType: s.street.type,
    zoneName: s.zone?.name ?? null,
    zoneCode: s.zone?.code ?? null,
    zoneColor: s.zone?.color ?? null,
    lengthM: s.lengthM,
    crossesZones: s.crossesZones,
    manuallyOverridden: s.manuallyOverridden,
  }));

  const unassignedStreets = streetStats.find((s) => s.zoneId === null)?._count ?? 0;
  const crossingStreets = await prisma.street.count({ where: { active: true, crossesZones: true } });
  const totalSegmentKm =
    (await prisma.streetSegment.aggregate({ _sum: { lengthM: true } }))._sum.lengthM ?? 0;
  const tender = await prisma.tender.findFirst({
    select: { totalInfrastructureKm: true, jurisdictionKm: true },
  });

  const summary = {
    evidenceTotal: evidence.length,
    evidenceVerified: evidence.filter((e) => e.verificationStatus === "VERIFIED").length,
    evidencePending: evidence.filter(
      (e) => e.verificationStatus === "EXTRACTED" || e.verificationStatus === "REQUIRES_REVIEW"
    ).length,
    evidenceRejected: evidence.filter((e) => e.verificationStatus === "REJECTED").length,
    conflictsOpen: conflicts.filter((c) => c.status === "OPEN").length,
    conflictsTotal: conflicts.length,
    zonesTotal: zones.length,
    zonesWithoutBoundary: zones.filter((z) => z.verificationStatus === "REQUIRES_REVIEW").length,
    zonesWithoutContractArea: zones.filter((z) => !z.contractArea).length,
    segmentsNeedingReview: await prisma.streetSegment.count({
      where: { verificationStatus: "REQUIRES_REVIEW" },
    }),
    unassignedStreets,
    crossingStreets,
    assignedKm: totalSegmentKm / 1000,
    tenderKm: tender?.totalInfrastructureKm ?? null,
    jurisdictionKm: tender?.jurisdictionKm ?? null,
  };

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="מקורות ואימות נתונים"
        subtitle={`${summary.evidencePending} נתונים ממתינים לאישור · ${summary.conflictsOpen} סתירות פתוחות · ${summary.zonesWithoutContractArea} אזורים ללא שיוך קבלן`}
      />
      <SourcesManager
        summary={summary}
        evidence={evidence}
        conflicts={conflicts.map((c) => ({
          id: c.id,
          topic: c.topic,
          valueA: c.valueA,
          sourceA: c.sourceA,
          valueB: c.valueB,
          sourceB: c.sourceB,
          valueC: c.valueC,
          sourceC: c.sourceC,
          status: c.status,
          resolvedValue: c.resolvedValue,
          resolvedByName: c.resolvedBy?.name ?? null,
          notes: c.notes,
        }))}
        zones={zones.map((z) => ({
          id: z.id,
          name: z.name,
          code: z.code,
          color: z.color,
          zoneNumber: z.zoneNumber,
          hasBoundary: z.verificationStatus !== "REQUIRES_REVIEW",
          boundaryStatus: z.verificationStatus,
          contractAreaId: z.contractArea?.id ?? null,
          contractAreaLabel: z.contractArea
            ? `${z.contractArea.name} — ${z.contractArea.contractor?.name ?? "ללא קבלן"}`
            : null,
          contractAreaStatus: z.contractAreaStatus,
          streetCount: z._count.streets,
          segmentCount: z._count.segments,
        }))}
        contractAreas={contractAreas.map((a) => ({
          id: a.id,
          areaNumber: a.areaNumber,
          name: a.name,
          contractorName: a.contractor?.name ?? null,
          quotaCount: a._count.quotas,
          dailyTotal: canSeeFinance ? Number(a.dailyTotal ?? 0) : null,
        }))}
        segments={segments}
        canVerify={canVerify}
        canAssign={canAssign}
        canSeeFinance={canSeeFinance}
      />
    </div>
  );
}
