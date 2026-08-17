import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { can, type Permission } from "@/lib/permissions";
import {
  APPEAL_DECISION_DAYS,
  APPEAL_WINDOW_DAYS,
  MUNICIPALITY_FIX_SURCHARGE_PERCENT,
} from "@/server/tender/defectCatalog";
import type { DefectStatus } from "@/generated/prisma/enums";

export class DefectError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

/**
 * Who may drive each transition, and where it may go.
 *
 * The separation matters: the contractor moves work forward and may appeal, but
 * can never accept his own proof of fix or rule on his own appeal. That
 * division is what makes the deduction trail hold up in a payment dispute.
 */
const TRANSITIONS: Record<
  DefectStatus,
  { to: DefectStatus; permission: Permission; label: string }[]
> = {
  NEW: [
    { to: "ASSIGNED", permission: "defects.assign", label: "העברה לטיפול" },
    { to: "IN_PROGRESS", permission: "defects.work", label: "התחלת טיפול" },
    { to: "REJECTED", permission: "defects.verify", label: "דחיית הליקוי" },
  ],
  ASSIGNED: [
    { to: "IN_PROGRESS", permission: "defects.work", label: "התחלת טיפול" },
    { to: "REJECTED", permission: "defects.work", label: "דחייה על ידי הקבלן" },
    { to: "ASSIGNED", permission: "defects.assign", label: "שינוי אחראי" },
  ],
  IN_PROGRESS: [
    { to: "AWAITING_PROOF", permission: "defects.work", label: "דיווח על תיקון" },
    { to: "REJECTED", permission: "defects.work", label: "דחייה על ידי הקבלן" },
  ],
  AWAITING_PROOF: [
    { to: "FIXED", permission: "defects.verify", label: "אישור התיקון" },
    { to: "IN_PROGRESS", permission: "defects.verify", label: "התיקון לא התקבל" },
  ],
  FIXED: [{ to: "CLOSED", permission: "defects.verify", label: "סגירת הליקוי" }],
  REJECTED: [
    { to: "APPEALED", permission: "defects.appeal", label: "ערעור" },
    { to: "CLOSED", permission: "defects.verify", label: "סגירה" },
    { to: "IN_PROGRESS", permission: "defects.verify", label: "החזרה לטיפול" },
  ],
  APPEALED: [
    { to: "CLOSED", permission: "defects.decideAppeal", label: "הכרעה בערעור וסגירה" },
    { to: "IN_PROGRESS", permission: "defects.decideAppeal", label: "קבלת הערעור חלקית — חזרה לטיפול" },
  ],
  CLOSED: [],
};

export function allowedTransitions(status: DefectStatus, role: string | null | undefined) {
  return TRANSITIONS[status].filter((t) => can(role, t.permission));
}

/**
 * Sequential per year, so the field reference stays short and readable
 * ("LK-2026-0042"). Zero-padded to four digits so lexicographic ordering by
 * reference matches numeric order — which is what makes taking the last row a
 * correct way to find the current maximum.
 */
async function nextReference(prefix: string, table: "defect" | "complaint") {
  const year = new Date().getFullYear();
  const startsWith = `${prefix}-${year}-`;
  const rows =
    table === "defect"
      ? await prisma.defect.findMany({
          where: { reference: { startsWith } },
          select: { reference: true },
          orderBy: { reference: "desc" },
          take: 1,
        })
      : await prisma.complaint.findMany({
          where: { reference: { startsWith } },
          select: { reference: true },
          orderBy: { reference: "desc" },
          take: 1,
        });
  const last = rows[0]?.reference;
  const n = last ? parseInt(last.split("-")[2], 10) + 1 : 1;
  return `${startsWith}${String(n).padStart(4, "0")}`;
}

export type CreateDefectInput = {
  defectTypeId?: string | null;
  zoneId?: string | null;
  streetId?: string | null;
  segmentId?: string | null;
  lat?: number | null;
  lon?: number | null;
  title: string;
  description?: string | null;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  origin?: "INSPECTION" | "CALL_CENTER" | "MANAGER" | "CONTRACTOR" | "OTHER";
  dueAt?: Date | null;
  assignedToId?: string | null;
  inspectionId?: string | null;
  complaintId?: string | null;
  reportedById: string;
};

export async function createDefect(input: CreateDefectInput) {
  const type = input.defectTypeId
    ? await prisma.defectType.findUnique({ where: { id: input.defectTypeId } })
    : null;
  if (input.defectTypeId && !type) throw new DefectError("סוג ליקוי לא נמצא");

  // Resolve the responsible contract area from the zone, and freeze it on the
  // defect: reassigning the zone later must not silently move an open charge
  // from one contractor to the other.
  let contractAreaId: string | null = null;
  let zoneId = input.zoneId ?? null;
  if (!zoneId && input.streetId) {
    const street = await prisma.street.findUnique({
      where: { id: input.streetId },
      select: { zoneId: true },
    });
    zoneId = street?.zoneId ?? null;
  }
  if (zoneId) {
    const zone = await prisma.operationalZone.findUnique({
      where: { id: zoneId },
      select: { contractAreaId: true },
    });
    contractAreaId = zone?.contractAreaId ?? null;
  }

  // §821: the deadline is the inspector's to set. We only pre-fill it where the
  // tender itself states one for this defect type.
  const dueAt =
    input.dueAt ??
    (type?.defaultFixHours
      ? new Date(Date.now() + type.defaultFixHours * 60 * 60 * 1000)
      : null);

  const reference = await nextReference("LK", "defect");

  const defect = await prisma.defect.create({
    data: {
      reference,
      defectTypeId: input.defectTypeId ?? null,
      zoneId,
      streetId: input.streetId ?? null,
      segmentId: input.segmentId ?? null,
      contractAreaId,
      lat: input.lat ?? null,
      lon: input.lon ?? null,
      title: input.title,
      description: input.description ?? null,
      severity: input.severity ?? "MEDIUM",
      origin: input.origin ?? "INSPECTION",
      status: input.assignedToId ? "ASSIGNED" : "NEW",
      assignedToId: input.assignedToId ?? null,
      reportedById: input.reportedById,
      dueAt,
      inspectionId: input.inspectionId ?? null,
      complaintId: input.complaintId ?? null,
      // A deduction is proposed from the catalog but is worth nothing until a
      // manager approves it (§825).
      deductionStatus: type ? "PROPOSED" : "NONE",
      deductionAmount: type ? type.deductionAmount : null,
      deductionReason: type ? `${type.name} — ${type.unitBasis}` : null,
    },
  });

  await prisma.defectEvent.create({
    data: {
      defectId: defect.id,
      action: "CREATED",
      toStatus: defect.status,
      userId: input.reportedById,
      note: type ? `סוג ליקוי: ${type.name}` : null,
    },
  });

  await audit({
    entityType: "Defect",
    entityId: defect.id,
    action: "CREATE_DEFECT",
    userId: input.reportedById,
    after: { reference, status: defect.status, deductionAmount: type?.deductionAmount ?? null },
    description: `ליקוי ${reference} נפתח: ${input.title}`,
  });

  return defect;
}

export async function changeStatus(opts: {
  defectId: string;
  to: DefectStatus;
  userId: string;
  role: string;
  note?: string | null;
  assignedToId?: string | null;
}) {
  const defect = await prisma.defect.findUnique({ where: { id: opts.defectId } });
  if (!defect) throw new DefectError("ליקוי לא נמצא", 404);

  const transition = TRANSITIONS[defect.status].find((t) => t.to === opts.to);
  if (!transition) {
    throw new DefectError(`לא ניתן להעביר ליקוי מסטטוס ${defect.status} לסטטוס ${opts.to}`);
  }
  if (!can(opts.role, transition.permission)) {
    throw new DefectError(`אין לך הרשאה לבצע: ${transition.label}`, 403);
  }

  // Accepting a fix requires the contractor to have actually shown one — the
  // whole point of the AWAITING_PROOF step.
  if (opts.to === "FIXED") {
    const afterPhotos = await prisma.defectPhoto.count({
      where: { defectId: defect.id, kind: "AFTER" },
    });
    if (afterPhotos === 0) {
      throw new DefectError("לא ניתן לאשר תיקון ללא תמונת 'אחרי' המוכיחה את הביצוע");
    }
  }

  const now = new Date();
  const updated = await prisma.defect.update({
    where: { id: opts.defectId },
    data: {
      status: opts.to,
      assignedToId: opts.assignedToId !== undefined ? opts.assignedToId : defect.assignedToId,
      fixedAt: opts.to === "FIXED" ? now : defect.fixedAt,
      closedAt: opts.to === "CLOSED" ? now : defect.closedAt,
      notDoneReason:
        opts.to === "REJECTED" ? (opts.note ?? defect.notDoneReason) : defect.notDoneReason,
      inspectorNotes:
        opts.to === "FIXED" || opts.to === "CLOSED"
          ? (opts.note ?? defect.inspectorNotes)
          : defect.inspectorNotes,
    },
  });

  await prisma.defectEvent.create({
    data: {
      defectId: opts.defectId,
      action: "STATUS_CHANGE",
      fromStatus: defect.status,
      toStatus: opts.to,
      userId: opts.userId,
      note: opts.note ?? null,
    },
  });

  await audit({
    entityType: "Defect",
    entityId: opts.defectId,
    action: `DEFECT_${opts.to}`,
    userId: opts.userId,
    before: { status: defect.status },
    after: { status: opts.to },
    description: `${defect.reference}: ${transition.label}`,
  });

  return updated;
}

/**
 * §825 — at month end the manager reviews the defect list and its deduction
 * amounts. Approving here is that decision; nothing is charged without it.
 */
export async function decideDeduction(opts: {
  defectId: string;
  decision: "APPROVED" | "WAIVED";
  amount?: number | null;
  /** §822: set when the municipality carried out the fix itself. */
  applySurcharge?: boolean;
  reason?: string | null;
  userId: string;
}) {
  const defect = await prisma.defect.findUnique({ where: { id: opts.defectId } });
  if (!defect) throw new DefectError("ליקוי לא נמצא", 404);
  if (defect.deductionStatus === "NONE") {
    throw new DefectError("לליקוי זה לא הוצע קיזוז");
  }
  if (defect.deductionStatus === "APPLIED") {
    throw new DefectError("הקיזוז כבר הוחל ואינו ניתן לשינוי");
  }

  const amount = opts.amount ?? Number(defect.deductionAmount ?? 0);
  const updated = await prisma.defect.update({
    where: { id: opts.defectId },
    data: {
      deductionStatus: opts.decision,
      deductionAmount: opts.decision === "WAIVED" ? defect.deductionAmount : amount,
      deductionSurchargePercent: opts.applySurcharge ? MUNICIPALITY_FIX_SURCHARGE_PERCENT : null,
      deductionReason: opts.reason ?? defect.deductionReason,
      deductionApprovedById: opts.userId,
      deductionApprovedAt: new Date(),
      // §826: the seven-day appeal clock starts when the decision is delivered.
      appealDueAt:
        opts.decision === "APPROVED"
          ? new Date(Date.now() + APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000)
          : null,
    },
  });

  await prisma.defectEvent.create({
    data: {
      defectId: opts.defectId,
      action: opts.decision === "APPROVED" ? "DEDUCTION_APPROVED" : "DEDUCTION_WAIVED",
      userId: opts.userId,
      note:
        opts.decision === "APPROVED"
          ? `קיזוז ${amount.toLocaleString("he-IL")} ₪${opts.applySurcharge ? ` + ${MUNICIPALITY_FIX_SURCHARGE_PERCENT}% הוצאות מיוחדות` : ""}`
          : (opts.reason ?? "הקיזוז בוטל"),
    },
  });

  await audit({
    entityType: "Defect",
    entityId: opts.defectId,
    action: `DEDUCTION_${opts.decision}`,
    userId: opts.userId,
    before: { deductionStatus: defect.deductionStatus, amount: Number(defect.deductionAmount ?? 0) },
    after: { deductionStatus: opts.decision, amount, surcharge: opts.applySurcharge ?? false },
    description: `${defect.reference}: קיזוז ${opts.decision === "APPROVED" ? "אושר" : "בוטל"}`,
  });

  return updated;
}

/** Total charge including the §822 surcharge, where one was applied. */
export function effectiveDeduction(defect: {
  deductionAmount: unknown;
  deductionSurchargePercent: number | null;
  deductionStatus: string;
}): number {
  if (defect.deductionStatus !== "APPROVED" && defect.deductionStatus !== "APPLIED") return 0;
  const base = Number(defect.deductionAmount ?? 0);
  const pct = defect.deductionSurchargePercent ?? 0;
  return Math.round(base * (1 + pct / 100) * 100) / 100;
}

/** §826 — contractor appeals within seven days of the list being delivered. */
export async function lodgeAppeal(opts: { defectId: string; text: string; userId: string }) {
  const defect = await prisma.defect.findUnique({ where: { id: opts.defectId } });
  if (!defect) throw new DefectError("ליקוי לא נמצא", 404);
  if (defect.deductionStatus !== "APPROVED") {
    throw new DefectError("ניתן לערער רק על קיזוז שאושר");
  }
  if (defect.appealedAt) throw new DefectError("כבר הוגש ערעור על ליקוי זה");
  if (defect.appealDueAt && defect.appealDueAt < new Date()) {
    throw new DefectError(
      `חלון הערעור בן ${APPEAL_WINDOW_DAYS} הימים הסתיים ב-${defect.appealDueAt.toLocaleDateString("he-IL")}`
    );
  }

  const now = new Date();
  const updated = await prisma.defect.update({
    where: { id: opts.defectId },
    data: {
      status: "APPEALED",
      appealText: opts.text,
      appealedAt: now,
      // §826 gives the department head fourteen days to rule.
      appealDueAt: new Date(now.getTime() + APPEAL_DECISION_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.defectEvent.create({
    data: {
      defectId: opts.defectId,
      action: "APPEAL_LODGED",
      fromStatus: defect.status,
      toStatus: "APPEALED",
      userId: opts.userId,
      note: opts.text,
    },
  });

  await audit({
    entityType: "Defect",
    entityId: opts.defectId,
    action: "APPEAL_LODGED",
    userId: opts.userId,
    description: `${defect.reference}: הוגש ערעור על הקיזוז`,
  });

  return updated;
}

/** §826 — the decision is final. */
export async function decideAppeal(opts: {
  defectId: string;
  accepted: boolean;
  decision: string;
  userId: string;
}) {
  const defect = await prisma.defect.findUnique({ where: { id: opts.defectId } });
  if (!defect) throw new DefectError("ליקוי לא נמצא", 404);
  if (defect.status !== "APPEALED") throw new DefectError("לא הוגש ערעור על ליקוי זה");

  const updated = await prisma.defect.update({
    where: { id: opts.defectId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      appealDecision: opts.decision,
      appealDecidedAt: new Date(),
      appealDecidedById: opts.userId,
      // Accepting the appeal cancels the charge.
      deductionStatus: opts.accepted ? "WAIVED" : "APPROVED",
    },
  });

  await prisma.defectEvent.create({
    data: {
      defectId: opts.defectId,
      action: opts.accepted ? "APPEAL_ACCEPTED" : "APPEAL_DENIED",
      fromStatus: "APPEALED",
      toStatus: "CLOSED",
      userId: opts.userId,
      note: opts.decision,
    },
  });

  await audit({
    entityType: "Defect",
    entityId: opts.defectId,
    action: opts.accepted ? "APPEAL_ACCEPTED" : "APPEAL_DENIED",
    userId: opts.userId,
    before: { deductionStatus: defect.deductionStatus },
    after: { deductionStatus: opts.accepted ? "WAIVED" : "APPROVED" },
    description: `${defect.reference}: הערעור ${opts.accepted ? "התקבל" : "נדחה"} — ${opts.decision}`,
  });

  return updated;
}

export async function createComplaint(input: {
  subject: string;
  description?: string | null;
  reporterName?: string | null;
  reporterPhone?: string | null;
  zoneId?: string | null;
  streetId?: string | null;
  lat?: number | null;
  lon?: number | null;
  dueAt?: Date | null;
  receivedById: string;
}) {
  const reference = await nextReference("TL", "complaint");
  const complaint = await prisma.complaint.create({
    data: {
      reference,
      subject: input.subject,
      description: input.description ?? null,
      reporterName: input.reporterName ?? null,
      reporterPhone: input.reporterPhone ?? null,
      zoneId: input.zoneId ?? null,
      streetId: input.streetId ?? null,
      lat: input.lat ?? null,
      lon: input.lon ?? null,
      dueAt: input.dueAt ?? null,
      receivedById: input.receivedById,
    },
  });

  await audit({
    entityType: "Complaint",
    entityId: complaint.id,
    action: "CREATE_COMPLAINT",
    userId: input.receivedById,
    description: `תלונה ${reference}: ${input.subject}`,
  });

  return complaint;
}

/** Defects past their deadline and not yet resolved. */
export async function getOverdueDefects() {
  return prisma.defect.findMany({
    where: {
      dueAt: { lt: new Date() },
      status: { notIn: ["FIXED", "CLOSED", "REJECTED"] },
    },
    orderBy: { dueAt: "asc" },
    include: {
      defectType: { select: { name: true } },
      zone: { select: { name: true, code: true } },
    },
  });
}
