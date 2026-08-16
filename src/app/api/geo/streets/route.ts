import { NextResponse } from "next/server";
import { getStreetsAsGeoJson } from "@/server/geo.service";

export async function GET() {
  const geojson = await getStreetsAsGeoJson();
  return NextResponse.json(geojson);
}
