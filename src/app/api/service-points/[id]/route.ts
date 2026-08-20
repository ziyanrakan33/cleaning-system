import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { reportServicePointFault } from "@/server/servicePoints/service";

const patchSchema = z.object({
  kind: z.enum(["WATER", "WASTE"]),
  name: z.string().min(1).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  address: z.string().nullable().optional(),
  zoneId: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "BROKEN", "TEMPORARILY_CLOSED", "REQUIRES_REVIEW"]).optional(),
  verificationStatus: z.enum(["EXTRACTED", "REQUIRES_REVIEW", "VERIFIED", "REJECTED", "CONFLICTED"]).optional(),
  active: z.boolean().optional(),
  connectionType: z.string().nullable().optional(),
  flowLitersPerMin: z.number().min(0).nullable().optional(),
  avgFillMinutes: z.number().min(0).nullable().optional(),
  avgWaitMinutes: z.number().min(0).nullable().optional(),
  parallelCapacity: z.number().int().min(1).optional(),
  maxVehicleWidthM: z.number().min(0).nullable().optional(),
  maxVehicleHeightM: z.number().min(0).nullable().optional(),
  availabilityHours: z.array(z.object({ day: z.string().optional(), from: z.string(), to: z.string() })).nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  allowedWasteTypes: z.array(z.string()).optional(),
  accessNotes: z.string().nullable().optional(),
  allowedResourceTypeIds: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  faultNote: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "servicePoints.manage")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { kind, allowedResourceTypeIds, status, faultNote, ...rest } = parsed.data;

  // A status change is routed through the dedicated fault-report path so the
  // audit trail and the note it leaves are consistent whether it came from
  // here or from a driver's "report a fault" button elsewhere.
  if (status) {
    try {
      await reportServicePointFault({ kind, id, status, note: faultNote ?? "", userId: session.user.id });
    } catch {
      return NextResponse.json({ error: "נקודה לא נמצאה" }, { status: 404 });
    }
  }

  const hasOtherChanges = Object.keys(rest).length > 0 || allowedResourceTypeIds !== undefined;
  if (hasOtherChanges) {
    const data = {
      ...rest,
      ...(allowedResourceTypeIds ? { allowedResourceTypes: { set: allowedResourceTypeIds.map((rid) => ({ id: rid })) } } : {}),
    };
    if (kind === "WATER") {
      await prisma.waterRefillPoint.update({ where: { id }, data: data as Prisma.WaterRefillPointUncheckedUpdateInput });
    } else {
      await prisma.wasteDisposalPoint.update({ where: { id }, data: data as Prisma.WasteDisposalPointUncheckedUpdateInput });
    }
    await audit({
      entityType: kind === "WATER" ? "WaterRefillPoint" : "WasteDisposalPoint",
      entityId: id,
      action: "SERVICE_POINT_UPDATED",
      userId: session.user.id,
      after: rest,
      description: `נקודת ${kind === "WATER" ? "מים" : "פריקה"} עודכנה`,
    });
  }

  const point =
    kind === "WATER"
      ? await prisma.waterRefillPoint.findUnique({ where: { id } })
      : await prisma.wasteDisposalPoint.findUnique({ where: { id } });
  return NextResponse.json(point);
}

/** Soft-disable: the manager takes a point out of rotation without losing its history. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "servicePoints.manage")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "WATER" && kind !== "WASTE") return NextResponse.json({ error: "kind חסר" }, { status: 400 });

  if (kind === "WATER") await prisma.waterRefillPoint.update({ where: { id }, data: { active: false } });
  else await prisma.wasteDisposalPoint.update({ where: { id }, data: { active: false } });

  await audit({
    entityType: kind === "WATER" ? "WaterRefillPoint" : "WasteDisposalPoint",
    entityId: id,
    action: "SERVICE_POINT_DISABLED",
    userId: session.user.id,
    description: `נקודת ${kind === "WATER" ? "מים" : "פריקה"} הושבתה`,
  });

  return NextResponse.json({ ok: true });
}
