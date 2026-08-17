import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSegmentsAsGeoJson } from "@/server/geo.service";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  const geojson = await getSegmentsAsGeoJson();
  return NextResponse.json(geojson);
}
