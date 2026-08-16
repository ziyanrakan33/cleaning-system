import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const zone = await prisma.zone.update({ where: { id }, data: parsed.data });
  return NextResponse.json(zone);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // Soft delete: keep history, unassign streets.
  await prisma.$transaction([
    prisma.street.updateMany({ where: { zoneId: id }, data: { zoneId: null } }),
    prisma.zone.update({ where: { id }, data: { active: false } }),
  ]);
  return NextResponse.json({ ok: true });
}
