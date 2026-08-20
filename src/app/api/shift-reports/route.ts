import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { todayDateOnly } from "@/server/dateUtils";
import { audit } from "@/server/audit";

const bodySchema = z.object({
  resourceId: z.string().min(1),
  operatorName: z.string().max(120).optional(),
  licensePlate: z.string().max(30).optional(),
  waterStartPercent: z.number().int().min(0).max(100).nullable().optional(),
  waterStartLiters: z.number().min(0).nullable().optional(),
  wasteTankState: z.string().max(120).nullable().optional(),
  vehicleCondition: z.string().max(120).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lon: z.number().min(-180).max(180).nullable().optional(),
});

/** §7: opens (or re-saves) today's shift report for one vehicle. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "field.report")) {
    return NextResponse.json({ error: "אין הרשאה לדווח" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const resource = await prisma.resource.findUnique({
    where: { id: parsed.data.resourceId },
    select: { id: true, identifier: true, assignedEmployeeId: true },
  });
  if (!resource) return NextResponse.json({ error: "כלי לא נמצא" }, { status: 404 });

  // A driver may only open a shift for a vehicle assigned to him; a manager
  // filling this in on someone's behalf is exempt (§18: field.report is also
  // granted to inspectors and supervisors).
  if (session.user.role === "EMPLOYEE" && resource.assignedEmployeeId !== session.user.id) {
    return NextResponse.json({ error: "הכלי אינו משויך אליך" }, { status: 403 });
  }

  const today = todayDateOnly();
  const reportData: Partial<typeof parsed.data> = { ...parsed.data };
  delete reportData.resourceId;
  const report = await prisma.shiftReport.upsert({
    where: { resourceId_date: { resourceId: resource.id, date: today } },
    create: { resourceId: resource.id, userId: session.user.id, date: today, startedAt: new Date(), ...reportData },
    update: { ...reportData },
  });

  await audit({
    entityType: "ShiftReport",
    entityId: report.id,
    action: "SHIFT_OPENED",
    userId: session.user.id,
    after: parsed.data,
    description: `פתיחת משמרת עבור ${resource.identifier}`,
  });

  return NextResponse.json(report, { status: 201 });
}

/** Today's shift report for one resource, if any — used to skip a re-prompt. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  const resourceId = new URL(req.url).searchParams.get("resourceId");
  if (!resourceId) return NextResponse.json({ error: "חסר resourceId" }, { status: 400 });

  // Same restriction as opening a shift (POST above): a driver may only read
  // back the report for a vehicle assigned to him, not any vehicle's by id.
  if (session.user.role === "EMPLOYEE") {
    const resource = await prisma.resource.findUnique({ where: { id: resourceId }, select: { assignedEmployeeId: true } });
    if (!resource || resource.assignedEmployeeId !== session.user.id) {
      return NextResponse.json({ error: "הכלי אינו משויך אליך" }, { status: 403 });
    }
  }

  const report = await prisma.shiftReport.findUnique({
    where: { resourceId_date: { resourceId, date: todayDateOnly() } },
  });
  return NextResponse.json(report);
}
