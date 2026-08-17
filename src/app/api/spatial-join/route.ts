import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { runSpatialJoin } from "@/server/geo/spatialJoin";

/** Recomputes street→zone attribution on demand. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  }
  if (!can(session.user.role, "zones.editBoundary")) {
    return NextResponse.json({ error: "אין הרשאה להריץ שיוך גיאוגרפי" }, { status: 403 });
  }

  const result = await runSpatialJoin();

  await audit({
    entityType: "StreetSegment",
    action: "RUN_SPATIAL_JOIN",
    userId: session.user.id,
    after: {
      segmentsCreated: result.segmentsCreated,
      streetsAssigned: result.streetsAssigned,
      protectedStreets: result.protectedStreets,
    },
    description:
      `שיוך גיאוגרפי הורץ: ${result.segmentsCreated} מקטעים, ${result.streetsAssigned} רחובות שויכו, ` +
      `${result.protectedStreets} רחובות מוגנים דולגו`,
  });

  return NextResponse.json(result);
}
