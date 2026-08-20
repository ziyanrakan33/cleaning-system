import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canAccessContractArea, resolveContractAreaScope } from "@/server/scope";

/**
 * Resolves the contract area a field photo's underlying entity belongs to,
 * where that's knowable (via a street's zone) — null when it isn't
 * (ShiftReport has no single owning zone; a resource can work across
 * several) or the entity has no zone/contract-area link at all. A null
 * result is treated as visible to everyone, same as canAccessContractArea's
 * general rule for un-attributed records.
 */
async function resolvePhotoContractArea(entityType: string, entityId: string): Promise<string | null> {
  if (entityType === "TaskFieldReport") {
    const report = await prisma.taskFieldReport.findUnique({
      where: { id: entityId },
      select: { workPlanTask: { select: { street: { select: { zone: { select: { contractAreaId: true } } } } } } },
    });
    return report?.workPlanTask.street.zone?.contractAreaId ?? null;
  }
  if (entityType === "StreetSurvey") {
    const survey = await prisma.streetSurvey.findUnique({
      where: { id: entityId },
      select: { street: { select: { zone: { select: { contractAreaId: true } } } } },
    });
    return survey?.street.zone?.contractAreaId ?? null;
  }
  if (entityType === "WaterRefillPoint") {
    const point = await prisma.waterRefillPoint.findUnique({ where: { id: entityId }, select: { zone: { select: { contractAreaId: true } } } });
    return point?.zone?.contractAreaId ?? null;
  }
  if (entityType === "WasteDisposalPoint") {
    const point = await prisma.wasteDisposalPoint.findUnique({ where: { id: entityId }, select: { zone: { select: { contractAreaId: true } } } });
    return point?.zone?.contractAreaId ?? null;
  }
  // ShiftReport: a resource can be allowed in several zones/contract areas —
  // there is no single owning one to check, so left unscoped.
  return null;
}

/**
 * Serves the bytes of one field photo. Mirrors
 * /api/defects/photos/[photoId]: a session is required, and the response is
 * marked private so it never lands in a shared cache.
 *
 * Any signed-in user may view, subject to the same contract-area scoping as
 * everything else a contractor-side account touches — the field photos are
 * operational evidence (a blocked street, a broken hydrant), not personal
 * data, but they can still reveal another contractor's site.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  const { id } = await params;
  const photo = await prisma.fieldPhoto.findUnique({ where: { id } });
  if (!photo) return NextResponse.json({ error: "תמונה לא נמצאה" }, { status: 404 });

  if (resolveContractAreaScope(session.user).restricted) {
    const contractAreaId = await resolvePhotoContractArea(photo.entityType, photo.entityId);
    if (!canAccessContractArea(session.user, contractAreaId)) {
      return NextResponse.json({ error: "תמונה לא נמצאה" }, { status: 404 });
    }
  }

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(photo.sizeBytes),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
