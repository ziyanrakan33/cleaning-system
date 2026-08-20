import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";

/**
 * Narrow, purpose-built edit endpoint: assigns (or clears) which contract
 * area a contractor-side account is scoped to (see src/server/scope.ts). Not
 * a general user-edit API — role/email/password changes stay out of scope
 * here until a real need for them is confirmed.
 */
const patchSchema = z.object({ contractAreaId: z.string().nullable() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "users.manage")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const before = await prisma.user.findUnique({ where: { id }, select: { contractAreaId: true, role: true } });
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const user = await prisma.user.update({
    where: { id },
    data: { contractAreaId: parsed.data.contractAreaId },
    select: { id: true, name: true, role: true, contractAreaId: true },
  });

  await audit({
    entityType: "User",
    entityId: id,
    action: "CONTRACT_AREA_ASSIGNED",
    userId: session.user.id,
    before: { contractAreaId: before.contractAreaId },
    after: { contractAreaId: user.contractAreaId },
    description: `שיוך אזור מכרז עודכן עבור ${user.name}`,
  });

  return NextResponse.json(user);
}
