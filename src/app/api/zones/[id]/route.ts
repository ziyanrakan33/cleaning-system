import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "zones.editBoundary")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const zone = await prisma.operationalZone.update({ where: { id }, data: parsed.data });

  await audit({
    entityType: "OperationalZone",
    entityId: zone.id,
    action: "ZONE_UPDATED",
    userId: session.user.id,
    after: parsed.data,
    description: `אזור תפעולי "${zone.name}" עודכן`,
  });

  return NextResponse.json(zone);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // Soft delete: keep history, unassign streets.
  const [, zone] = await prisma.$transaction([
    prisma.street.updateMany({ where: { zoneId: id }, data: { zoneId: null } }),
    prisma.operationalZone.update({ where: { id }, data: { active: false } }),
  ]);

  await audit({
    entityType: "OperationalZone",
    entityId: id,
    action: "ZONE_DEACTIVATED",
    userId: session.user.id,
    after: { active: false },
    description: `אזור תפעולי "${zone.name}" הושבת ורחובותיו שוחררו מהשיוך`,
  });

  return NextResponse.json({ ok: true });
}
