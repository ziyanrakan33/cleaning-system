import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createDefect, DefectError, effectiveDeduction } from "@/server/defects/service";
import type { Prisma } from "@/generated/prisma/client";

const createSchema = z.object({
  defectTypeId: z.string().nullish(),
  zoneId: z.string().nullish(),
  streetId: z.string().nullish(),
  segmentId: z.string().nullish(),
  lat: z.number().nullish(),
  lon: z.number().nullish(),
  title: z.string().min(2, "יש לתאר את הליקוי"),
  description: z.string().nullish(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  origin: z.enum(["INSPECTION", "CALL_CENTER", "MANAGER", "CONTRACTOR", "OTHER"]).optional(),
  dueAt: z.string().datetime().nullish(),
  assignedToId: z.string().nullish(),
  inspectionId: z.string().nullish(),
  complaintId: z.string().nullish(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "defects.view")) {
    return NextResponse.json({ error: "אין הרשאה לצפות בליקויים" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const zoneId = url.searchParams.get("zoneId");
  const contractAreaId = url.searchParams.get("contractAreaId");
  const overdueOnly = url.searchParams.get("overdue") === "1";

  const where: Prisma.DefectWhereInput = {};
  if (status && status !== "ALL") {
    where.status = status === "OPEN"
      ? { notIn: ["CLOSED", "FIXED"] }
      : (status as Prisma.DefectWhereInput["status"]);
  }
  if (zoneId) where.zoneId = zoneId;
  if (contractAreaId) where.contractAreaId = contractAreaId;
  if (overdueOnly) {
    where.dueAt = { lt: new Date() };
    where.status = { notIn: ["FIXED", "CLOSED", "REJECTED"] };
  }

  const showMoney = can(session.user.role, "finance.view");

  const defects = await prisma.defect.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { reportedAt: "desc" }],
    take: 300,
    include: {
      defectType: { select: { name: true, code: true, category: true } },
      zone: { select: { name: true, code: true, color: true } },
      street: { select: { name: true } },
      contractArea: { select: { name: true, contractor: { select: { name: true } } } },
      assignedTo: { select: { name: true } },
      reportedBy: { select: { name: true } },
      _count: { select: { photos: true } },
    },
  });

  return NextResponse.json(
    defects.map((d) => ({
      id: d.id,
      reference: d.reference,
      title: d.title,
      status: d.status,
      severity: d.severity,
      origin: d.origin,
      typeName: d.defectType?.name ?? null,
      typeCategory: d.defectType?.category ?? null,
      zoneName: d.zone?.name ?? null,
      zoneColor: d.zone?.color ?? null,
      streetName: d.street?.name ?? null,
      contractorName: d.contractArea?.contractor?.name ?? null,
      assignedToName: d.assignedTo?.name ?? null,
      reportedByName: d.reportedBy.name,
      reportedAt: d.reportedAt.toISOString(),
      dueAt: d.dueAt?.toISOString() ?? null,
      overdue: !!d.dueAt && d.dueAt < new Date() && !["FIXED", "CLOSED", "REJECTED"].includes(d.status),
      photoCount: d._count.photos,
      deductionStatus: d.deductionStatus,
      // Money is withheld from roles without finance access, per the tender's
      // separation between operational and financial visibility.
      deductionAmount: showMoney ? Number(d.deductionAmount ?? 0) : null,
      effectiveDeduction: showMoney ? effectiveDeduction(d) : null,
      lat: d.lat,
      lon: d.lon,
    }))
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "defects.create")) {
    return NextResponse.json({ error: "אין הרשאה לפתוח ליקוי" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const defect = await createDefect({
      ...parsed.data,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      reportedById: session.user.id,
    });
    return NextResponse.json(defect, { status: 201 });
  } catch (err) {
    if (err instanceof DefectError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
