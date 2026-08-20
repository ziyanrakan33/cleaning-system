import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { learnFromTaskFieldReport } from "@/server/learning/updateFromExecution";

const bodySchema = z.object({
  startedAt: z.string().datetime().nullable().optional(),
  endedAt: z.string().datetime().nullable().optional(),
  dirtBefore: z.number().int().min(1).max(5).nullable().optional(),
  cleanAfter: z.number().int().min(1).max(5).nullable().optional(),
  waterBeforeL: z.number().min(0).nullable().optional(),
  waterAfterL: z.number().min(0).nullable().optional(),
  waterBeforePercent: z.number().int().min(0).max(100).nullable().optional(),
  waterAfterPercent: z.number().int().min(0).max(100).nullable().optional(),
  refillNeeded: z.boolean().default(false),
  waterRefillPointId: z.string().nullable().optional(),
  refillMinutes: z.number().min(0).nullable().optional(),
  wasteDumpNeeded: z.boolean().default(false),
  wasteDisposalPointId: z.string().nullable().optional(),
  dumpMinutes: z.number().min(0).nullable().optional(),
  accessProblem: z.boolean().default(false),
  parkedVehicles: z.boolean().default(false),
  blocked: z.boolean().default(false),
  vehicleSuitable: z.boolean().default(true),
  needsRevisit: z.boolean().default(false),
  notes: z.string().max(1000).nullable().optional(),
  nonCompletionReason: z.enum(["BLOCKED", "WATER_SHORTAGE", "ACCESS_ISSUE", "VEHICLE_UNSUITABLE", "DEFECT", "OTHER"]).nullable().optional(),
  /** Set only when the worker used the "raise a defect" shortcut — the defect must already exist (created via a separate, permission-checked call). */
  defectId: z.string().nullable().optional(),
  /** Client-generated per-submit-attempt UUID — see prisma schema comment on
   *  TaskFieldReport.idempotencyKey. A retried submit with the same key
   *  returns the already-created report instead of creating a duplicate and
   *  re-applying the EWMA learning update. */
  idempotencyKey: z.string().min(8).max(100).nullable().optional(),
});

/** §8: end-of-street execution report. Also the input the learning layer (§17) trains on. */
export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "field.report")) {
    return NextResponse.json({ error: "אין הרשאה לדווח" }, { status: 403 });
  }

  const { taskId } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const task = await prisma.workPlanTask.findUnique({
    where: { id: taskId },
    include: { resource: { select: { assignedEmployeeId: true } }, street: { select: { name: true } } },
  });
  if (!task) return NextResponse.json({ error: "משימה לא נמצאה" }, { status: 404 });

  if (session.user.role === "EMPLOYEE" && task.resource.assignedEmployeeId !== session.user.id) {
    return NextResponse.json({ error: "המשימה אינה משויכת אליך" }, { status: 403 });
  }

  const { startedAt, endedAt, idempotencyKey, ...rest } = parsed.data;

  if (idempotencyKey) {
    const existing = await prisma.taskFieldReport.findUnique({ where: { idempotencyKey } });
    if (existing) {
      // Already submitted (and already learned from) on a previous attempt —
      // a retry on a flaky connection must not create a duplicate or
      // double-apply the EWMA update, so just hand back what was saved.
      return NextResponse.json({ reportId: existing.id, learningUpdates: [], deduplicated: true }, { status: 200 });
    }
  }

  let report;
  try {
    report = await prisma.taskFieldReport.create({
      data: {
        workPlanTaskId: taskId,
        reportedById: session.user.id,
        startedAt: startedAt ? new Date(startedAt) : null,
        endedAt: endedAt ? new Date(endedAt) : null,
        idempotencyKey,
        ...rest,
      },
    });
  } catch (err) {
    // A concurrent retry with the same key can race past the check above —
    // the unique constraint is the real guard; on conflict, return the row
    // the other request just created rather than erroring.
    if (idempotencyKey && (err as { code?: string }).code === "P2002") {
      const existing = await prisma.taskFieldReport.findUnique({ where: { idempotencyKey } });
      if (existing) return NextResponse.json({ reportId: existing.id, learningUpdates: [], deduplicated: true }, { status: 200 });
    }
    throw err;
  }

  await audit({
    entityType: "TaskFieldReport",
    entityId: report.id,
    action: "FIELD_REPORT_SUBMITTED",
    userId: session.user.id,
    after: { taskId, streetName: task.street.name },
    description: `דיווח ביצוע עבור "${task.street.name}"`,
  });

  const learningUpdates = await learnFromTaskFieldReport(report.id);

  return NextResponse.json({ reportId: report.id, learningUpdates }, { status: 201 });
}
