import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/server/dateUtils";
import { buildSingleRoutePlan } from "@/server/routing/optimization/alternatives";
import { persistRoutePlan } from "@/server/scheduling/persistPlan";
import { resolveContractAreaScope } from "@/server/scope";
import { audit } from "@/server/audit";
import { checkRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Defaults to the priority-first, fastest-route variant for a plain "generate" call. */
  variant: z.enum(["FASTEST", "DIRT_PRIORITY", "WATER_SAVING"]).default("FASTEST"),
  zoneIds: z.array(z.string()).optional(),
  resourceIds: z.array(z.string()).optional(),
  /** Cost of the alternatives the manager did NOT pick, from a prior /api/plans/propose call — stored so the plan can explain why this one won. */
  rejectedAlternatives: z
    .array(z.object({ variantLabel: z.string(), cost: z.object({ total: z.number(), lines: z.array(z.unknown()) }) }))
    .optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "plans.edit")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Full-city route optimization is CPU-heavy and granted to several roles,
  // not just admins — cap repeated calls per user rather than trust every
  // caller to only click "generate" when they mean it.
  if (!checkRateLimit(`plan-generate:${session.user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "יותר מדי בקשות ליצירת תוכנית — נסו שוב בעוד דקה." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const date = parseDateOnly(parsed.data.date);

  // A contractor-side account may only ever generate a plan for the zones in
  // its own contract area — never a city-wide plan, and never another
  // contractor's zones, regardless of what zoneIds it passes in.
  let zoneIds = parsed.data.zoneIds;
  const scope = resolveContractAreaScope(session.user);
  if (scope.restricted) {
    if (!scope.contractAreaId) {
      return NextResponse.json({ error: "no_contract_area_assigned", message: "לא שויך אזור מכרז לחשבון זה" }, { status: 403 });
    }
    const ownZones = await prisma.operationalZone.findMany({
      where: { contractAreaId: scope.contractAreaId },
      select: { id: true },
    });
    const ownZoneIds = new Set(ownZones.map((z) => z.id));
    zoneIds = zoneIds ? zoneIds.filter((id) => ownZoneIds.has(id)) : [...ownZoneIds];
    if (zoneIds.length === 0) {
      return NextResponse.json({ error: "no_zones_in_scope", message: "אין אזורים תפעוליים משויכים לאזור המכרז של חשבון זה" }, { status: 403 });
    }
  }

  try {
    const chosen = await buildSingleRoutePlan({
      date,
      variant: parsed.data.variant,
      zoneIds,
      resourceIds: parsed.data.resourceIds,
    });
    const result = await persistRoutePlan({
      date,
      createdById: session.user.id,
      chosen,
      rejectedAlternatives: parsed.data.rejectedAlternatives as
        | { variantLabel: string; cost: import("@/server/routing/optimization/provider").RoutePlanResult["cost"] }[]
        | undefined,
    });
    await audit({
      entityType: "WorkPlan",
      entityId: result.workPlanId,
      action: "PLAN_GENERATED",
      userId: session.user.id,
      after: { date: result.date, variant: result.variant, totalAssignedStreets: result.totalAssignedStreets },
      description: `תוכנית עבודה נוצרה ל-${result.date} (${result.variantLabel})`,
    });

    return NextResponse.json(result);
  } catch (e) {
    logger.error({ err: e, date: parsed.data.date, userId: session.user.id }, "plan generation failed");
    return NextResponse.json({ error: "generation_failed", message: (e as Error).message }, { status: 500 });
  }
}
