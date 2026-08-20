import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { setZoneGeometry, type LonLat } from "@/server/geo.service";
import { runSpatialJoin } from "@/server/geo/spatialJoin";
import { audit } from "@/server/audit";
import { prisma } from "@/lib/prisma";
import { validatePolygonPoints, uncloseRing } from "@/lib/geo-utils";

const bodySchema = z.object({
  ring: z.array(z.tuple([z.number(), z.number()])).min(4),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  }
  if (!can(session.user.role, "zones.editBoundary")) {
    return NextResponse.json({ error: "אין הרשאה לערוך גבולות אזורים" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "פורמט קואורדינטות לא תקין" }, { status: 400 });
  }

  const ring = parsed.data.ring as LonLat[];
  const distinctPoints = uncloseRing(ring);
  const validation = validatePolygonPoints(distinctPoints);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Close the ring if the client didn't already repeat the first point.
  const closed =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring
      : [...ring, ring[0]];

  try {
    const { repaired } = await setZoneGeometry(id, closed, { allowRepair: false });

    // Drawn by hand on the map, so it is a deliberate human decision — record it
    // as verified rather than leaving it looking like an unconfirmed extraction.
    const zone = await prisma.operationalZone.update({
      where: { id },
      data: {
        verificationStatus: "VERIFIED",
        confidence: "HIGH",
        manuallyOverridden: true,
      },
      select: { id: true, name: true },
    });

    await prisma.sourceEvidence.updateMany({
      where: { entityType: "OperationalZone", entityId: id, fieldName: "geometry" },
      data: {
        sourceType: "MANUAL_ENTRY",
        sourceFile: "ציור ידני במסך עורך הגבולות",
        extractedValue: `${closed.length} נקודות`,
        confidence: "HIGH",
        verificationStatus: "VERIFIED",
        verifiedById: session.user.id,
        verifiedAt: new Date(),
        notes: "הגבול שורטט ידנית על ידי מנהל ולא הופק מצילום המפה.",
      },
    });

    await audit({
      entityType: "OperationalZone",
      entityId: id,
      action: "DRAW_BOUNDARY",
      userId: session.user.id,
      after: { points: closed.length },
      description: `גבול ${zone.name} שורטט ידנית (${closed.length} נקודות)`,
    });

    // Street→zone attribution depends on this boundary, so recompute immediately
    // rather than letting the map and the kilometre totals lag behind it.
    const join = await runSpatialJoin();

    return NextResponse.json({
      ok: true,
      zone,
      repaired,
      join: {
        segmentsCreated: join.segmentsCreated,
        streetsAssigned: join.streetsAssigned,
        streetsUnassigned: join.streetsUnassigned,
        streetsCrossingZones: join.streetsCrossingZones,
        segmentsRequiringReview: join.segmentsRequiringReview,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "שגיאה בשמירת הגבול" }, { status: 400 });
  }
}
