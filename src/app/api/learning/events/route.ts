import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";

const FIELD_LABELS: Record<string, string> = {
  avgActualCleanMin: "זמן ניקיון בפועל (דקות)",
  dirtDynamicLevel: "רמת לכלוך מדודה",
  estWaterLitersPer100m: "צריכת מים (ליטר ל-100מ׳)",
};

/** §17 — what changed, on what evidence, paginated newest-first. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "learning.review")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const take = Math.min(200, Number(sp.get("take") ?? "50"));
  const entityId = sp.get("entityId");

  const events = await prisma.profileLearningEvent.findMany({
    where: entityId ? { entityId } : {},
    orderBy: { createdAt: "desc" },
    take,
    include: { excludedBy: { select: { name: true } } },
  });

  const streetIds = [...new Set(events.filter((e) => e.entityType === "StreetCleaningProfile").map((e) => e.entityId))];
  const streets = await prisma.street.findMany({ where: { id: { in: streetIds } }, select: { id: true, name: true } });
  const streetNames = new Map(streets.map((s) => [s.id, s.name]));

  return NextResponse.json(
    events.map((e) => ({
      id: e.id,
      entityType: e.entityType,
      entityId: e.entityId,
      entityLabel: streetNames.get(e.entityId) ?? e.entityId,
      fieldName: e.fieldName,
      fieldLabel: FIELD_LABELS[e.fieldName] ?? e.fieldName,
      oldValue: e.oldValue,
      newValue: e.newValue,
      sampleValue: e.sampleValue,
      sampleCount: e.sampleCount,
      reason: e.reason,
      excluded: e.excluded,
      excludedByName: e.excludedBy?.name ?? null,
      excludedAt: e.excludedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
    }))
  );
}
