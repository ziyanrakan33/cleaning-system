import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { parseDateOnly, todayDateOnly } from "@/server/dateUtils";

/**
 * §561 fixes the two daily rounds at 10:00 and 12:00. AD_HOC exists for tours
 * outside that schedule, which the contract does not forbid.
 */
const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך בפורמט YYYY-MM-DD"),
  round: z.enum(["MORNING_10", "MIDDAY_12", "AD_HOC"]),
  zoneId: z.string().nullish(),
  contractorRepId: z.string().nullish(),
  meetingPoint: z.string().nullish(),
  notes: z.string().nullish(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "inspections.manage")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const dateParam = new URL(req.url).searchParams.get("date");
  // WorkPlan-style @db.Date column: must go through the date-only helper or the
  // record lands on the previous day east of UTC.
  const date = dateParam ? parseDateOnly(dateParam) : todayDateOnly();

  const inspections = await prisma.inspection.findMany({
    where: { date },
    orderBy: [{ round: "asc" }, { createdAt: "asc" }],
    include: {
      zone: { select: { name: true, code: true, color: true } },
      inspector: { select: { name: true } },
      contractorRep: { select: { name: true } },
      _count: { select: { defects: true } },
    },
  });

  return NextResponse.json(
    inspections.map((i) => ({
      id: i.id,
      date: i.date.toISOString(),
      round: i.round,
      zoneName: i.zone?.name ?? null,
      zoneColor: i.zone?.color ?? null,
      inspectorName: i.inspector.name,
      contractorRepName: i.contractorRep?.name ?? null,
      status: i.status,
      meetingPoint: i.meetingPoint,
      startedAt: i.startedAt?.toISOString() ?? null,
      completedAt: i.completedAt?.toISOString() ?? null,
      notes: i.notes,
      defectCount: i._count.defects,
    }))
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "inspections.manage")) {
    return NextResponse.json({ error: "אין הרשאה לתכנן סיור" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { date, round, zoneId, contractorRepId, meetingPoint, notes } = parsed.data;

  const existing = await prisma.inspection.findFirst({
    where: { date: parseDateOnly(date), round, zoneId: zoneId ?? null },
  });
  if (existing) {
    return NextResponse.json(
      { error: "כבר קיים סיור לאזור זה בפעימה זו באותו תאריך" },
      { status: 409 }
    );
  }

  const inspection = await prisma.inspection.create({
    data: {
      date: parseDateOnly(date),
      round,
      zoneId: zoneId ?? null,
      contractorRepId: contractorRepId ?? null,
      meetingPoint: meetingPoint ?? null,
      notes: notes ?? null,
      inspectorId: session.user.id,
    },
  });

  await audit({
    entityType: "Inspection",
    entityId: inspection.id,
    action: "CREATE_INSPECTION",
    userId: session.user.id,
    after: { date, round, zoneId },
    description: `תוכנן סיור פיקוח ${date} (${round})`,
  });

  return NextResponse.json(inspection, { status: 201 });
}
