import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { setZoneGeometry } from "@/server/geo.service";
import { runSpatialJoin } from "@/server/geo/spatialJoin";
import { BoundaryParseError, parseBoundaryFile } from "@/server/geo/boundaryImport";

/** 8 MB is generous for a single zone outline and keeps a stray upload from stalling the request. */
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  }
  if (!can(session.user.role, "zones.editBoundary")) {
    return NextResponse.json({ error: "אין הרשאה לערוך גבולות אזורים" }, { status: 403 });
  }

  const { id } = await params;
  const zone = await prisma.operationalZone.findUnique({ where: { id } });
  if (!zone) {
    return NextResponse.json({ error: "אזור לא נמצא" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "הקובץ גדול מ-8MB" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseBoundaryFile(file.name, await file.text());
  } catch (err) {
    if (err instanceof BoundaryParseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const { repaired } = await setZoneGeometry(id, parsed.ring);
  if (repaired) parsed.warnings.push("הגבול שיובא לא היה תקין גיאומטרית (צורה עצמית-חוצה) ותוקן אוטומטית — מומלץ לבדוק על המפה שהצורה נכונה.");

  await prisma.operationalZone.update({
    where: { id },
    data: {
      // Imported from a real geographic file rather than guessed from a photo,
      // but still a manager's responsibility to confirm on the map.
      verificationStatus: "EXTRACTED",
      confidence: "MEDIUM",
      notes: `גבול יובא מקובץ "${file.name}"${parsed.sourceName ? ` (${parsed.sourceName})` : ""}.`,
    },
  });

  await prisma.sourceEvidence.updateMany({
    where: { entityType: "OperationalZone", entityId: id, fieldName: "geometry" },
    data: {
      sourceFile: file.name,
      sourceType: "GIS_IMPORT",
      extractedValue: `${parsed.ring.length} נקודות`,
      confidence: "MEDIUM",
      verificationStatus: "EXTRACTED",
      notes: `יובא מקובץ ${file.name}. ${parsed.warnings.join(" ") || ""}`.trim(),
    },
  });

  await audit({
    entityType: "OperationalZone",
    entityId: id,
    action: "IMPORT_BOUNDARY",
    userId: session.user.id,
    after: { filename: file.name, points: parsed.ring.length },
    description: `גבול ${zone.name} יובא מקובץ ${file.name} (${parsed.ring.length} נקודות)`,
  });

  // A new boundary changes which streets belong where, so recompute now rather
  // than leaving the map showing stale attribution.
  const join = await runSpatialJoin();

  return NextResponse.json({
    ok: true,
    points: parsed.ring.length,
    sourceName: parsed.sourceName,
    warnings: parsed.warnings,
    join: {
      segmentsCreated: join.segmentsCreated,
      streetsAssigned: join.streetsAssigned,
      streetsUnassigned: join.streetsUnassigned,
      streetsCrossingZones: join.streetsCrossingZones,
      segmentsRequiringReview: join.segmentsRequiringReview,
    },
  });
}
