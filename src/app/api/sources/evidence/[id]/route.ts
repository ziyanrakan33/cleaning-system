import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";

const bodySchema = z.object({
  verificationStatus: z.enum(["EXTRACTED", "REQUIRES_REVIEW", "VERIFIED", "REJECTED", "CONFLICTED"]),
  /** Set when the manager corrects the value rather than merely approving it. */
  correctedValue: z.string().nullish(),
  notes: z.string().nullish(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  }
  if (!can(session.user.role, "sources.verify")) {
    return NextResponse.json({ error: "אין הרשאה לאמת נתוני מקור" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.sourceEvidence.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "רשומת מקור לא נמצאה" }, { status: 404 });
  }

  const { verificationStatus, correctedValue, notes } = parsed.data;
  const valueChanged =
    correctedValue !== undefined && correctedValue !== null && correctedValue !== existing.extractedValue;

  const updated = await prisma.sourceEvidence.update({
    where: { id },
    data: {
      verificationStatus,
      extractedValue: valueChanged ? correctedValue : existing.extractedValue,
      // A human decision is high confidence regardless of how it was extracted.
      confidence: verificationStatus === "VERIFIED" ? "HIGH" : existing.confidence,
      notes: notes ?? existing.notes,
      verifiedById: session.user.id,
      verifiedAt: new Date(),
    },
  });

  if (valueChanged) {
    await prisma.manualOverride.create({
      data: {
        entityType: existing.entityType,
        entityId: existing.entityId,
        fieldName: existing.fieldName ?? "(לא צוין)",
        previousValue: existing.extractedValue,
        newValue: correctedValue,
        reason: notes ?? "תיקון ידני במסך מקורות ואימות",
        overriddenById: session.user.id,
      },
    });
  }

  await audit({
    entityType: "SourceEvidence",
    entityId: id,
    action: valueChanged ? "CORRECT_EVIDENCE" : `SET_EVIDENCE_${verificationStatus}`,
    userId: session.user.id,
    before: { verificationStatus: existing.verificationStatus, extractedValue: existing.extractedValue },
    after: { verificationStatus, extractedValue: updated.extractedValue },
    description: `${existing.entityType}.${existing.fieldName ?? "-"} → ${verificationStatus}`,
  });

  return NextResponse.json(updated);
}
