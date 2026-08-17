import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";

const patchSchema = z.object({
  status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  notes: z.string().nullish(),
  contractorRepId: z.string().nullish(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "inspections.manage")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { status, notes, contractorRepId } = parsed.data;

  const existing = await prisma.inspection.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "סיור לא נמצא" }, { status: 404 });

  const now = new Date();
  const updated = await prisma.inspection.update({
    where: { id },
    data: {
      status,
      notes: notes ?? existing.notes,
      contractorRepId: contractorRepId !== undefined ? contractorRepId : existing.contractorRepId,
      startedAt: status === "IN_PROGRESS" && !existing.startedAt ? now : existing.startedAt,
      completedAt: status === "COMPLETED" ? now : existing.completedAt,
    },
  });

  await audit({
    entityType: "Inspection",
    entityId: id,
    action: `INSPECTION_${status}`,
    userId: session.user.id,
    before: { status: existing.status },
    after: { status },
    description: `סיור פיקוח: ${status}`,
  });

  return NextResponse.json(updated);
}
