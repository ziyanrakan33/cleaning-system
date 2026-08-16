import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStreetsAsGeoJson } from "@/server/geo.service";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const geojson = await getStreetsAsGeoJson();
  return NextResponse.json(geojson);
}
