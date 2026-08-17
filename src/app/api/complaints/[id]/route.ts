import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";

const patchSchema = z.object({
  status: z.enum(["NEW", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED", "CLOSED"]).optional(),
  assignedToId: z.string().nullish(),
  resolution: z.string().nullish(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "complaints.manage")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { status, assignedToId, resolution } = parsed.data;

  const existing = await prisma.complaint.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "תלונה לא נמצאה" }, { status: 404 });

  if (status === "RESOLVED" && !(resolution ?? existing.resolution)) {
    return NextResponse.json(
      { error: "יש לתאר כיצד טופלה התלונה לפני סגירתה כמטופלת" },
      { status: 400 }
    );
  }

  const updated = await prisma.complaint.update({
    where: { id },
    data: {
      status: status ?? existing.status,
      assignedToId: assignedToId !== undefined ? assignedToId : existing.assignedToId,
      resolution: resolution ?? existing.resolution,
      resolvedAt: status === "RESOLVED" ? new Date() : existing.resolvedAt,
    },
  });

  await audit({
    entityType: "Complaint",
    entityId: id,
    action: `COMPLAINT_${status ?? "UPDATED"}`,
    userId: session.user.id,
    before: { status: existing.status },
    after: { status: updated.status },
    description: `${existing.reference}: ${status ?? "עודכנה"}`,
  });

  return NextResponse.json(updated);
}
