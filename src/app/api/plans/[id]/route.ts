import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getStreetGeometryForTasks } from "@/server/geo.service";
import { formatDateOnly } from "@/server/dateUtils";
import { runFeasibilityCheck } from "@/server/routing/optimization/feasibility";
import { audit } from "@/server/audit";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "plans.edit")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workPlan = await prisma.workPlan.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: [{ resourceId: "asc" }, { sequenceOrder: "asc" }],
        include: {
          street: { select: { id: true, name: true, type: true, priority: true } },
          resource: { select: { id: true, identifier: true, name: true, resourceType: { select: { name: true } } } },
        },
      },
      serviceStops: {
        orderBy: [{ resourceId: "asc" }, { sequenceOrder: "asc" }],
        include: { waterRefillPoint: { select: { name: true } }, wasteDisposalPoint: { select: { name: true } } },
      },
    },
  });

  if (!workPlan) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const streetIds = [...new Set(workPlan.tasks.map((t) => t.streetId))];
  const geometries = await getStreetGeometryForTasks(streetIds);

  const byResource = new Map<string, typeof workPlan.tasks>();
  for (const task of workPlan.tasks) {
    const key = task.resourceId;
    if (!byResource.has(key)) byResource.set(key, []);
    byResource.get(key)!.push(task);
  }
  const stopsByResource = new Map<string, typeof workPlan.serviceStops>();
  for (const stop of workPlan.serviceStops) {
    const arr = stopsByResource.get(stop.resourceId) ?? [];
    arr.push(stop);
    stopsByResource.set(stop.resourceId, arr);
  }

  const resources = [...byResource.entries()].map(([resourceId, tasks]) => ({
    resourceId,
    identifier: tasks[0].resource.identifier,
    name: tasks[0].resource.name,
    typeName: tasks[0].resource.resourceType.name,
    tasks: tasks.map((t) => ({
      id: t.id,
      sequenceOrder: t.sequenceOrder,
      streetId: t.streetId,
      streetName: t.street.name,
      streetType: t.street.type,
      priority: t.street.priority,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      distanceM: t.distanceM,
      travelTimeMin: t.travelTimeMin,
      cleanTimeMin: t.cleanTimeMin,
      status: t.status,
      geometry: geometries.get(t.streetId) ?? null,
      projectedWaterAfterL: t.projectedWaterAfterL,
      waterBasis: t.waterBasis,
    })),
    serviceStops: (stopsByResource.get(resourceId) ?? []).map((s) => ({
      id: s.id,
      sequenceOrder: s.sequenceOrder,
      kind: s.kind,
      pointName: s.waterRefillPoint?.name ?? s.wasteDisposalPoint?.name ?? "—",
      plannedArrival: s.plannedArrival,
      plannedDeparture: s.plannedDeparture,
      reason: s.reason,
      litersLoaded: s.litersLoaded,
      basis: s.basis,
    })),
  }));

  return NextResponse.json({
    id: workPlan.id,
    date: formatDateOnly(workPlan.date),
    versionNumber: workPlan.versionNumber,
    status: workPlan.status,
    variant: workPlan.variant,
    planningExplanation: workPlan.planningExplanation,
    feasibility: workPlan.feasibility,
    resources,
  });
}

const patchSchema = z.object({
  status: z.enum(["DRAFT", "CONFIRMED", "ARCHIVED"]),
  /** Required by §13 when publishing (CONFIRMED) a plan whose feasibility check fails. */
  overrideReason: z.string().min(3).optional(),
  /** Required (§PLN-04) when a manager explicitly cancels/archives a plan — distinct from automatic archiving when a sibling plan is confirmed instead. */
  cancelReason: z.string().min(3).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "plans.publish")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const before = await prisma.workPlan.findUnique({ where: { id }, select: { status: true } });
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // An explicit cancellation (as opposed to being auto-superseded by a newer
  // confirmed plan, or simply saved back to DRAFT) always needs a reason —
  // same UX pattern as the feasibility override above.
  if (parsed.data.status === "ARCHIVED" && before.status !== "ARCHIVED" && !parsed.data.cancelReason) {
    return NextResponse.json(
      { error: "cancel_reason_required", message: "יש להזין סיבה לביטול התוכנית." },
      { status: 400 }
    );
  }

  // §13: publishing runs the feasibility check fresh — against what is
  // actually saved right now, including any manual edits made since
  // generation — and blocks unless it passes or a reason is given.
  if (parsed.data.status === "CONFIRMED") {
    const feasibility = await runFeasibilityCheck(id);
    await prisma.workPlan.update({
      where: { id },
      data: { feasibility: feasibility as unknown as Prisma.InputJsonValue },
    });

    if (!feasibility.ok && !parsed.data.overrideReason) {
      return NextResponse.json(
        {
          error: "feasibility_failed",
          message: "בדיקת ההיתכנות נכשלה. יש להזין סיבה כדי לפרסם בכל זאת.",
          feasibility,
        },
        { status: 409 }
      );
    }

    if (!feasibility.ok && parsed.data.overrideReason) {
      await prisma.workPlan.update({
        where: { id },
        data: { overrideReason: parsed.data.overrideReason, overrideApprovedById: session.user.id },
      });
      await audit({
        entityType: "WorkPlan",
        entityId: id,
        action: "PUBLISHED_WITH_OVERRIDE",
        userId: session.user.id,
        after: { reason: parsed.data.overrideReason, failedChecks: feasibility.checks.filter((c) => !c.passed).map((c) => c.id) },
        description: `תוכנית פורסמה חרף אזהרות היתכנות: ${parsed.data.overrideReason}`,
      });
    }
  }

  // A date may only have one CONFIRMED plan at a time — otherwise two
  // confirmed plans for the same date could each pass their own
  // RESOURCE_OVERLAP check while double-booking a vehicle/employee between
  // them. Archiving any previous holder happens inside the same transaction
  // as the status change so the invariant holds even under concurrent
  // requests, not just at the moment this plan was checked.
  const isExplicitCancel = parsed.data.status === "ARCHIVED" && before.status !== "ARCHIVED" && !!parsed.data.cancelReason;

  const { plan, supersededIds } = await prisma.$transaction(async (tx) => {
    const updated = await tx.workPlan.update({
      where: { id },
      data: {
        status: parsed.data.status,
        ...(isExplicitCancel
          ? { cancelReason: parsed.data.cancelReason, cancelledById: session.user.id, cancelledAt: new Date() }
          : {}),
      },
    });

    await tx.workPlanChange.create({
      data: {
        workPlanId: id,
        changedById: session.user.id,
        changeType: "STATUS_CHANGE",
        description: `סטטוס שונה מ-${before.status} ל-${parsed.data.status}`,
        before: { status: before.status },
        after: { status: parsed.data.status },
      },
    });

    let supersededIds: string[] = [];
    if (parsed.data.status === "CONFIRMED") {
      const superseded = await tx.workPlan.findMany({
        where: { date: updated.date, status: "CONFIRMED", id: { not: id } },
        select: { id: true },
      });
      supersededIds = superseded.map((p) => p.id);
      if (supersededIds.length > 0) {
        await tx.workPlan.updateMany({ where: { id: { in: supersededIds } }, data: { status: "ARCHIVED" } });
        await tx.workPlanChange.createMany({
          data: supersededIds.map((supersededId) => ({
            workPlanId: supersededId,
            changedById: session.user.id,
            changeType: "STATUS_CHANGE" as const,
            description: `אורכב אוטומטית — תוכנית ${id} אושרה לאותו תאריך`,
            before: { status: "CONFIRMED" },
            after: { status: "ARCHIVED" },
          })),
        });
      }
    }

    return { plan: updated, supersededIds };
  });

  if (isExplicitCancel) {
    await audit({
      entityType: "WorkPlan",
      entityId: id,
      action: "PLAN_CANCELLED",
      userId: session.user.id,
      after: { reason: parsed.data.cancelReason },
      description: `תוכנית בוטלה: ${parsed.data.cancelReason}`,
    });
  }

  if (supersededIds.length > 0) {
    await audit({
      entityType: "WorkPlan",
      entityId: id,
      action: "SUPERSEDED_SIBLING_PLANS",
      userId: session.user.id,
      after: { archivedPlanIds: supersededIds },
      description: `אישור תוכנית זו אירכב ${supersededIds.length} תוכניות מאושרות קודמות לאותו תאריך`,
    });
  }

  return NextResponse.json(plan);
}
