import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/server/dateUtils";
import { buildRouteAlternatives } from "@/server/routing/optimization/alternatives";
import { resolveContractAreaScope } from "@/server/scope";
import { checkRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  zoneIds: z.array(z.string()).optional(),
  resourceIds: z.array(z.string()).optional(),
});

/**
 * §12: computes up to three route alternatives for the given date and
 * returns them for comparison — nothing is written to the database. The
 * manager picks one (or edits it) and only then calls /api/plans/generate.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "plans.edit")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  }
  if (!checkRateLimit(`plan-propose:${session.user.id}`, 15, 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "יותר מדי בקשות — נסו שוב בעוד דקה." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const date = parseDateOnly(parsed.data.date);

  // Same contract-area restriction as /api/plans/generate — a proposal
  // preview must not surface another contractor's streets/resources either.
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
    const { alternatives, totalDueStreets, resourceCount } = await buildRouteAlternatives({
      date,
      zoneIds,
      resourceIds: parsed.data.resourceIds,
    });

    return NextResponse.json({
      date: parsed.data.date,
      totalDueStreets,
      resourceCount,
      alternatives: alternatives.map((a) => ({
        variant: a.variant,
        variantLabel: a.variantLabel,
        strategyExplanation: a.strategyExplanation,
        cost: a.cost,
        unassignedCount: a.unassigned.length,
        unassigned: a.unassigned,
        resources: a.resources.map((r) => ({
          resourceId: r.resourceId,
          identifier: r.identifier,
          name: r.name,
          typeName: r.typeName,
          taskCount: r.events.filter((e) => e.kind === "TASK").length,
          totalCleanMinutes: Math.round(r.totalCleanMin),
          totalTravelMinutes: Math.round(r.totalTravelMin),
          totalWaterUsedL: r.totalWaterUsedL,
          refillCount: r.refillCount,
          dumpCount: r.dumpCount,
          finishTime: r.finishAt.toTimeString().slice(0, 5),
          overCapacity: r.overCapacity,
        })),
      })),
    });
  } catch (e) {
    logger.error({ err: e, date: parsed.data.date, userId: session.user.id }, "route proposal failed");
    return NextResponse.json({ error: "proposal_failed", message: (e as Error).message }, { status: 500 });
  }
}
