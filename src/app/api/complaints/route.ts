import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createComplaint } from "@/server/defects/service";

const createSchema = z.object({
  subject: z.string().min(2, "יש לציין את נושא התלונה"),
  description: z.string().nullish(),
  reporterName: z.string().nullish(),
  reporterPhone: z.string().nullish(),
  zoneId: z.string().nullish(),
  streetId: z.string().nullish(),
  lat: z.number().nullish(),
  lon: z.number().nullish(),
  dueAt: z.string().datetime().nullish(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "complaints.manage")) {
    return NextResponse.json({ error: "אין הרשאה לצפות בתלונות" }, { status: 403 });
  }

  const status = new URL(req.url).searchParams.get("status");
  const complaints = await prisma.complaint.findMany({
    where: status && status !== "ALL" ? { status: status as never } : {},
    orderBy: [{ status: "asc" }, { receivedAt: "desc" }],
    take: 300,
    include: {
      zone: { select: { name: true, color: true } },
      street: { select: { name: true } },
      receivedBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      _count: { select: { defects: true } },
    },
  });

  return NextResponse.json(
    complaints.map((c) => ({
      id: c.id,
      reference: c.reference,
      subject: c.subject,
      description: c.description,
      status: c.status,
      zoneName: c.zone?.name ?? null,
      zoneColor: c.zone?.color ?? null,
      streetName: c.street?.name ?? null,
      reporterName: c.reporterName,
      reporterPhone: c.reporterPhone,
      receivedAt: c.receivedAt.toISOString(),
      dueAt: c.dueAt?.toISOString() ?? null,
      resolvedAt: c.resolvedAt?.toISOString() ?? null,
      resolution: c.resolution,
      receivedByName: c.receivedBy.name,
      assignedToName: c.assignedTo?.name ?? null,
      defectCount: c._count.defects,
      overdue: !!c.dueAt && c.dueAt < new Date() && !["RESOLVED", "CLOSED", "REJECTED"].includes(c.status),
    }))
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "complaints.manage")) {
    return NextResponse.json({ error: "אין הרשאה לרשום תלונה" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const complaint = await createComplaint({
    ...parsed.data,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    receivedById: session.user.id,
  });
  return NextResponse.json(complaint, { status: 201 });
}
