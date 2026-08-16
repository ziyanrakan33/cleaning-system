import { NextResponse } from "next/server";
import { getZonesAsGeoJson } from "@/server/geo.service";

export async function GET() {
  const geojson = await getZonesAsGeoJson();
  return NextResponse.json(geojson);
}
