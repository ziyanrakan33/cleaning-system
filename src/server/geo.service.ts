import { prisma } from "@/lib/prisma";

export type LonLat = [number, number];

function toWkt(coords: LonLat[]): string {
  return `LINESTRING(${coords.map(([lon, lat]) => `${lon} ${lat}`).join(", ")})`;
}

/**
 * Sets a street's LineString geometry (WGS84) and derives length_m + start/end
 * point columns from it. Geometry is Unsupported() in the Prisma schema, so
 * this must go through raw SQL.
 */
export async function setStreetGeometry(streetId: string, coords: LonLat[]) {
  if (coords.length < 2) throw new Error("A street geometry needs at least 2 points");
  const wkt = toWkt(coords);
  const [start] = coords;
  const end = coords[coords.length - 1];

  await prisma.$executeRaw`
    UPDATE streets
    SET geometry = ST_SetSRID(ST_GeomFromText(${wkt}), 4326),
        length_m = ST_Length(ST_SetSRID(ST_GeomFromText(${wkt}), 4326)::geography),
        start_point_lon = ${start[0]},
        start_point_lat = ${start[1]},
        end_point_lon = ${end[0]},
        end_point_lat = ${end[1]}
    WHERE id = ${streetId}
  `;
}

/** Sets a zone's Polygon geometry (WGS84) from a ring of [lon, lat] points. */
export async function setZoneGeometry(zoneId: string, ring: LonLat[]) {
  if (ring.length < 4) throw new Error("A polygon ring needs at least 4 points (closed)");
  const wkt = `POLYGON((${ring.map(([lon, lat]) => `${lon} ${lat}`).join(", ")}))`;
  await prisma.$executeRaw`
    UPDATE zones
    SET geometry = ST_SetSRID(ST_GeomFromText(${wkt}), 4326)
    WHERE id = ${zoneId}
  `;
}

export type StreetGeoJsonRow = {
  id: string;
  name: string;
  type: string;
  priority: string;
  zoneId: string | null;
  geojson: string | null;
};

/** All active streets as a FeatureCollection-ready row set for the map. */
export async function getStreetsAsGeoJson() {
  const rows = await prisma.$queryRaw<StreetGeoJsonRow[]>`
    SELECT id, name, type::text as type, priority::text as priority,
           zone_id as "zoneId", ST_AsGeoJSON(geometry) as geojson
    FROM streets
    WHERE active = true AND geometry IS NOT NULL
  `;
  return {
    type: "FeatureCollection" as const,
    features: rows
      .filter((r) => r.geojson)
      .map((r) => ({
        type: "Feature" as const,
        geometry: JSON.parse(r.geojson as string),
        properties: { id: r.id, name: r.name, type: r.type, priority: r.priority, zoneId: r.zoneId },
      })),
  };
}

export type ZoneGeoJsonRow = {
  id: string;
  name: string;
  code: string;
  color: string;
  geojson: string | null;
};

export async function getZonesAsGeoJson() {
  const rows = await prisma.$queryRaw<ZoneGeoJsonRow[]>`
    SELECT id, name, code, color, ST_AsGeoJSON(geometry) as geojson
    FROM zones
    WHERE active = true
  `;
  return {
    type: "FeatureCollection" as const,
    features: rows
      .filter((r) => r.geojson)
      .map((r) => ({
        type: "Feature" as const,
        geometry: JSON.parse(r.geojson as string),
        properties: { id: r.id, name: r.name, code: r.code, color: r.color },
      })),
  };
}

/** Suggests a zone for a street by point-in-polygon test against its midpoint. Manager confirms/overrides. */
export async function suggestZoneForStreet(streetId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ zoneId: string | null }[]>`
    SELECT z.id as "zoneId"
    FROM streets s
    JOIN zones z ON ST_Contains(z.geometry, ST_LineInterpolatePoint(s.geometry, 0.5))
    WHERE s.id = ${streetId} AND z.active = true
    LIMIT 1
  `;
  return rows[0]?.zoneId ?? null;
}
