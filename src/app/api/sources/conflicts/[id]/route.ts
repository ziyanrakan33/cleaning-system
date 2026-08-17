import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";

const bodySchema = z
  .object({
    status: z.enum(["OPEN", "RESOLVED", "ACCEPTED_BOTH"]),
    /** Required when resolving — the system must never pick a value itself. */
    resolvedValue: z.string().nullish(),
    notes: z.string().nullish(),
  })
  .refine((b) => b.status !== "RESOLVED" || (b.resolvedValue ?? "").trim().length > 0, {
    message: "יש לציין את הערך שנבחר בעת הכרעת סתירה",
    path: ["resolvedValue"],
  });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  }
  if (!can(session.user.role, "sources.verify")) {
    return NextResponse.json({ error: "אין הרשאה להכריע בסתירות" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.sourceConflict.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "סתירה לא נמצאה" }, { status: 404 });
  }

  const { status, resolvedValue, notes } = parsed.data;
  const resolving = status !== "OPEN";

  const updated = await prisma.sourceConflict.update({
    where: { id },
    data: {
      status,
      resolvedValue: resolving ? (resolvedValue ?? null) : null,
      resolvedById: resolving ? session.user.id : null,
      resolvedAt: resolving ? new Date() : null,
      notes: notes ?? existing.notes,
    },
  });

  await audit({
    entityType: "SourceConflict",
    entityId: id,
    action: `CONFLICT_${status}`,
    userId: session.user.id,
    before: { status: existing.status, resolvedValue: existing.resolvedValue },
    after: { status, resolvedValue: updated.resolvedValue },
    description: `סתירה "${existing.topic}" → ${status}${resolvedValue ? `: ${resolvedValue}` : ""}`,
  });

  return NextResponse.json(updated);
}
