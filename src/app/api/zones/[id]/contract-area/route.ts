import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";

/**
 * Sets which contract area (and therefore which contractor) an operational zone
 * belongs to.
 *
 * This is the one decision no source can make for us: the tender draft leaves
 * the per-contractor zone lists blank (§543-544) and its zone map (נספח ו') is
 * not among the supplied files. So the link starts null and is set here, by a
 * human, with the change recorded.
 */
const bodySchema = z.object({
  contractAreaId: z.string().nullable(),
  reason: z.string().nullish(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  }
  if (!can(session.user.role, "zones.assignContractArea")) {
    return NextResponse.json(
      { error: "שיוך אזור לקבלן שמור למנהל מערכת ולמנהל עירוני בלבד" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const zone = await prisma.operationalZone.findUnique({
    where: { id },
    include: { contractArea: { include: { contractor: true } } },
  });
  if (!zone) {
    return NextResponse.json({ error: "אזור לא נמצא" }, { status: 404 });
  }

  const { contractAreaId, reason } = parsed.data;

  const target = contractAreaId
    ? await prisma.contractArea.findUnique({
        where: { id: contractAreaId },
        include: { contractor: true },
      })
    : null;
  if (contractAreaId && !target) {
    return NextResponse.json({ error: "אזור מכרז לא נמצא" }, { status: 400 });
  }

  const updated = await prisma.operationalZone.update({
    where: { id },
    data: {
      contractAreaId,
      // Set by a person, so it stops being an open question.
      contractAreaStatus: contractAreaId ? "VERIFIED" : "REQUIRES_REVIEW",
    },
  });

  const before = zone.contractArea
    ? `${zone.contractArea.name} — ${zone.contractArea.contractor?.name ?? "ללא קבלן"}`
    : null;
  const after = target ? `${target.name} — ${target.contractor?.name ?? "ללא קבלן"}` : null;

  await prisma.manualOverride.create({
    data: {
      entityType: "OperationalZone",
      entityId: id,
      fieldName: "contractAreaId",
      previousValue: before,
      newValue: after,
      reason: reason ?? "נקבע ידנית — המקורות אינם מגדירים את השיוך",
      overriddenById: session.user.id,
    },
  });

  await audit({
    entityType: "OperationalZone",
    entityId: id,
    action: "ASSIGN_CONTRACT_AREA",
    userId: session.user.id,
    before: { contractAreaId: zone.contractAreaId, label: before },
    after: { contractAreaId, label: after },
    description: `${zone.name}: שיוך לאזור מכרז ${before ?? "ללא"} → ${after ?? "ללא"}`,
  });

  // Mark the matching evidence row as settled so the zone stops showing up as
  // "waiting for a decision" once the decision has been made.
  await prisma.sourceEvidence.updateMany({
    where: { entityType: "OperationalZone", entityId: id, fieldName: "contractAreaId" },
    data: {
      verificationStatus: contractAreaId ? "VERIFIED" : "REQUIRES_REVIEW",
      extractedValue: after,
      confidence: contractAreaId ? "HIGH" : "LOW",
      verifiedById: session.user.id,
      verifiedAt: new Date(),
      notes: contractAreaId
        ? "נקבע ידנית על ידי מנהל. המקורות אינם מגדירים את השיוך — ראה §542–544 במכרז."
        : null,
    },
  });

  return NextResponse.json(updated);
}
