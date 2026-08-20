import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";

const hoursSchema = z.array(
  z.object({ day: z.string().optional(), from: z.string(), to: z.string() })
);

const waterCreateSchema = z.object({
  kind: z.literal("WATER"),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  address: z.string().nullable().optional(),
  zoneId: z.string().nullable().optional(),
  connectionType: z.string().nullable().optional(),
  flowLitersPerMin: z.number().min(0).nullable().optional(),
  avgFillMinutes: z.number().min(0).nullable().optional(),
  avgWaitMinutes: z.number().min(0).nullable().optional(),
  parallelCapacity: z.number().int().min(1).default(1),
  maxVehicleWidthM: z.number().min(0).nullable().optional(),
  maxVehicleHeightM: z.number().min(0).nullable().optional(),
  availabilityHours: hoursSchema.nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  allowedResourceTypeIds: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
});

const wasteCreateSchema = z.object({
  kind: z.literal("WASTE"),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  address: z.string().nullable().optional(),
  zoneId: z.string().nullable().optional(),
  allowedWasteTypes: z.array(z.string()).default([]),
  avgDumpMinutes: z.number().min(0).nullable().optional(),
  avgWaitMinutes: z.number().min(0).nullable().optional(),
  maxVehicleWidthM: z.number().min(0).nullable().optional(),
  maxVehicleHeightM: z.number().min(0).nullable().optional(),
  availabilityHours: hoursSchema.nullable().optional(),
  accessNotes: z.string().nullable().optional(),
  allowedResourceTypeIds: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
});

const createSchema = z.discriminatedUnion("kind", [waterCreateSchema, wasteCreateSchema]);

/** Drops the discriminator field before handing the rest to Prisma, which has no `kind` column. */
function omitKind<T extends { kind: unknown }>(data: T): Omit<T, "kind"> {
  const clone: Partial<T> = { ...data };
  delete clone.kind;
  return clone as Omit<T, "kind">;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  const [water, waste] = await Promise.all([
    prisma.waterRefillPoint.findMany({
      where: { active: true },
      include: { zone: { select: { id: true, name: true } }, allowedResourceTypes: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.wasteDisposalPoint.findMany({
      where: { active: true },
      include: { zone: { select: { id: true, name: true } }, allowedResourceTypes: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({ water, waste });
}

/** Click-to-add on the map, or the form: one endpoint, discriminated by `kind`. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "servicePoints.manage")) {
    return NextResponse.json({ error: "אין הרשאה לנהל נקודות שירות" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { allowedResourceTypeIds, ...data } = parsed.data;

  if (data.kind === "WATER") {
    const rest = omitKind(data);
    const point = await prisma.waterRefillPoint.create({
      data: {
        ...rest,
        status: "REQUIRES_REVIEW",
        verificationStatus: "REQUIRES_REVIEW",
        sourceType: "MANUAL_ENTRY",
        allowedResourceTypes: { connect: allowedResourceTypeIds.map((id) => ({ id })) },
      } as Prisma.WaterRefillPointUncheckedCreateInput,
    });
    await audit({
      entityType: "WaterRefillPoint",
      entityId: point.id,
      action: "SERVICE_POINT_CREATED",
      userId: session.user.id,
      after: { name: point.name },
      description: `נקודת מים "${point.name}" נוספה — ממתינה לאימות`,
    });
    return NextResponse.json(point, { status: 201 });
  }

  const rest = omitKind(data);
  const point = await prisma.wasteDisposalPoint.create({
    data: {
      ...rest,
      status: "REQUIRES_REVIEW",
      verificationStatus: "REQUIRES_REVIEW",
      allowedResourceTypes: { connect: allowedResourceTypeIds.map((id) => ({ id })) },
    } as Prisma.WasteDisposalPointUncheckedCreateInput,
  });
  await audit({
    entityType: "WasteDisposalPoint",
    entityId: point.id,
    action: "SERVICE_POINT_CREATED",
    userId: session.user.id,
    after: { name: point.name },
    description: `נקודת פריקה "${point.name}" נוספה — ממתינה לאימות`,
  });
  return NextResponse.json(point, { status: 201 });
}
