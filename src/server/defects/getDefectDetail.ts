import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { allowedTransitions, effectiveDeduction } from "./service";

/**
 * Builds the full defect detail DTO — shared by the API route (client
 * refetch-after-mutation) and the server component (first paint), so the two
 * never drift and so the detail page can render its initial state without a
 * client-side fetch-on-mount effect.
 */
export async function getDefectDetail(defectId: string, role: string | null | undefined) {
  const d = await prisma.defect.findUnique({
    where: { id: defectId },
    include: {
      defectType: true,
      zone: { select: { name: true, code: true, color: true } },
      street: { select: { name: true } },
      contractArea: { select: { name: true, contractor: { select: { name: true } } } },
      assignedTo: { select: { id: true, name: true } },
      reportedBy: { select: { name: true } },
      deductionApprovedBy: { select: { name: true } },
      appealDecidedBy: { select: { name: true } },
      complaint: { select: { id: true, reference: true, subject: true } },
      inspection: { select: { id: true, date: true, round: true } },
      photos: {
        orderBy: { uploadedAt: "asc" },
        select: {
          id: true,
          kind: true,
          caption: true,
          sizeBytes: true,
          uploadedAt: true,
          uploadedBy: { select: { name: true } },
        },
      },
      events: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { name: true } } },
      },
    },
  });
  if (!d) return null;

  const showMoney = can(role, "finance.view");

  return {
    id: d.id,
    reference: d.reference,
    title: d.title,
    description: d.description,
    status: d.status,
    severity: d.severity,
    origin: d.origin,
    type: d.defectType
      ? {
          code: d.defectType.code,
          name: d.defectType.name,
          category: d.defectType.category,
          unitBasis: d.defectType.unitBasis,
          deductionAmount: showMoney ? Number(d.defectType.deductionAmount) : null,
          sourceSection: d.defectType.sourceSection,
        }
      : null,
    zone: d.zone,
    streetName: d.street?.name ?? null,
    contractAreaId: d.contractAreaId,
    contractAreaName: d.contractArea?.name ?? null,
    contractorName: d.contractArea?.contractor?.name ?? null,
    lat: d.lat,
    lon: d.lon,
    assignedTo: d.assignedTo,
    reportedByName: d.reportedBy.name,
    reportedAt: d.reportedAt.toISOString(),
    dueAt: d.dueAt?.toISOString() ?? null,
    fixedAt: d.fixedAt?.toISOString() ?? null,
    closedAt: d.closedAt?.toISOString() ?? null,
    overdue: !!d.dueAt && d.dueAt < new Date() && !["FIXED", "CLOSED", "REJECTED"].includes(d.status),
    notDoneReason: d.notDoneReason,
    inspectorNotes: d.inspectorNotes,
    deduction: {
      status: d.deductionStatus,
      amount: showMoney ? Number(d.deductionAmount ?? 0) : null,
      surchargePercent: d.deductionSurchargePercent,
      effective: showMoney ? effectiveDeduction(d) : null,
      reason: d.deductionReason,
      approvedByName: d.deductionApprovedBy?.name ?? null,
      approvedAt: d.deductionApprovedAt?.toISOString() ?? null,
    },
    appeal: {
      text: d.appealText,
      appealedAt: d.appealedAt?.toISOString() ?? null,
      dueAt: d.appealDueAt?.toISOString() ?? null,
      decision: d.appealDecision,
      decidedAt: d.appealDecidedAt?.toISOString() ?? null,
      decidedByName: d.appealDecidedBy?.name ?? null,
    },
    complaint: d.complaint,
    inspection: d.inspection
      ? { id: d.inspection.id, date: d.inspection.date.toISOString(), round: d.inspection.round }
      : null,
    photos: d.photos.map((p) => ({
      id: p.id,
      kind: p.kind,
      caption: p.caption,
      sizeBytes: p.sizeBytes,
      uploadedAt: p.uploadedAt.toISOString(),
      uploadedByName: p.uploadedBy.name,
    })),
    events: d.events.map((e) => ({
      id: e.id,
      action: e.action,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      // The approval note is generated with the shekel amount baked in
      // ("קיזוז 500 ₪ + 15% ..."), so it must be withheld from viewers without
      // finance.view the same way deduction.amount is — the action label alone
      // ("הקיזוז אושר") already tells a contractor what happened.
      note: !showMoney && e.action === "DEDUCTION_APPROVED" ? null : e.note,
      userName: e.user?.name ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
    availableTransitions: allowedTransitions(d.status, role),
    canApproveDeduction: can(role, "finance.approveDeduction"),
    canAppeal: can(role, "defects.appeal"),
    canDecideAppeal: can(role, "defects.decideAppeal"),
    canSeeFinance: showMoney,
  };
}

export type DefectDetailDto = NonNullable<Awaited<ReturnType<typeof getDefectDetail>>>;
