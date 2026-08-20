import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { getVehicleProfile } from "@/server/resources/operationalProfile";

const patchSchema = z.object({
  waterCapacityL: z.number().min(0).max(50000).nullable().optional(),
  wasteCapacityKg: z.number().min(0).max(50000).nullable().optional(),
  minWaterReserveL: z.number().min(0).max(50000).nullable().optional(),
  waterLPerWorkHour: z.number().min(0).max(10000).nullable().optional(),
  waterLPerCleanKm: z.number().min(0).max(10000).nullable().optional(),
  wasteKgPerCleanKm: z.number().min(0).max(10000).nullable().optional(),
  widthM: z.number().min(0).max(10).nullable().optional(),
  heightM: z.number().min(0).max(10).nullable().optional(),
  weightKg: z.number().min(0).max(100000).nullable().optional(),
  canEnterPath: z.boolean().optional(),
  canMountSidewalk: z.boolean().optional(),
  allowedRoadTypes: z.array(z.string()).optional(),
  avgWorkSpeedMPerMin: z.number().min(0).max(1000).nullable().optional(),
  avgTravelSpeedKmh: z.number().min(0).max(200).nullable().optional(),
  avgFillMinutes: z.number().min(0).max(240).nullable().optional(),
  avgDumpMinutes: z.number().min(0).max(240).nullable().optional(),
  startPointLat: z.number().min(-90).max(90).nullable().optional(),
  startPointLon: z.number().min(-180).max(180).nullable().optional(),
  endPointLat: z.number().min(-90).max(90).nullable().optional(),
  endPointLon: z.number().min(-180).max(180).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/** Resolved profile — merges vehicle-specific, type-catalog and legacy attribute sources. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  const { id } = await params;
  const resolved = await getVehicleProfile(id);
  if (!resolved) return NextResponse.json({ error: "משאב לא נמצא" }, { status: 404 });

  const raw = await prisma.resourceOperationalProfile.findUnique({ where: { resourceId: id } });
  return NextResponse.json({ resolved, raw });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "resources.edit")) {
    return NextResponse.json({ error: "אין הרשאה לערוך פרופיל תפעולי" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const resource = await prisma.resource.findUnique({ where: { id }, select: { id: true, identifier: true } });
  if (!resource) return NextResponse.json({ error: "משאב לא נמצא" }, { status: 404 });

  const before = await prisma.resourceOperationalProfile.findUnique({ where: { resourceId: id } });

  await prisma.resourceOperationalProfile.upsert({
    where: { resourceId: id },
    create: { resourceId: id, ...parsed.data, verificationStatus: "VERIFIED" },
    update: { ...parsed.data, verificationStatus: "VERIFIED" },
  });

  await audit({
    entityType: "ResourceOperationalProfile",
    entityId: id,
    action: before ? "PROFILE_UPDATED" : "PROFILE_CREATED",
    userId: session.user.id,
    before: (before ?? undefined) as unknown as import("@/generated/prisma/client").Prisma.InputJsonValue | undefined,
    after: parsed.data,
    description: `פרופיל תפעולי של ${resource.identifier} עודכן`,
  });

  return NextResponse.json(await getVehicleProfile(id));
}
