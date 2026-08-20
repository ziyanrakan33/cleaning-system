import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type LonLat = [number, number];

/** Anything with `$executeRaw` — the module-level client, or a `tx` inside `prisma.$transaction(async (tx) => ...)`. */
type QueryClient = Pick<typeof prisma, "$executeRaw"> | Prisma.TransactionClient;

function toWkt(coords: LonLat[]): string {
  return `LINESTRING(${coords.map(([lon, lat]) => `${lon} ${lat}`).join(", ")})`;
}

/**
 * Sets a street's LineString geometry (WGS84) and derives length_m + start/end
 * point columns from it. Geometry is Unsupported() in the Prisma schema, so
 * this must go through raw SQL. Pass `client` (a `tx` from `prisma.$transaction`)
 * when this needs to be atomic with other writes in the same transaction —
 * it defaults to the module-level `prisma` otherwise.
 */
export async function setStreetGeometry(streetId: string, coords: LonLat[], client: QueryClient = prisma) {
  if (coords.length < 2) throw new Error("A street geometry needs at least 2 points");
  const wkt = toWkt(coords);
  const [start] = coords;
  const end = coords[coords.length - 1];

  // ST_MakeValid is a no-op on an already-valid LineString — cheap insurance
  // against a self-intersecting import that would otherwise silently corrupt
  // every ST_Intersection/ST_Contains query touching this row later (§GEO-02).
  await client.$executeRaw`
    UPDATE streets
    SET geometry = ST_MakeValid(ST_SetSRID(ST_GeomFromText(${wkt}), 4326)),
        length_m = ST_Length(ST_SetSRID(ST_GeomFromText(${wkt}), 4326)::geography),
        start_point_lon = ${start[0]},
        start_point_lat = ${start[1]},
        end_point_lon = ${end[0]},
        end_point_lat = ${end[1]}
    WHERE id = ${streetId}
  `;
}

/**
 * Sets a zone's Polygon geometry (WGS84) from a ring of [lon, lat] points.
 * Repairs a self-intersecting ring via ST_MakeValid rather than storing it
 * broken — an invalid polygon corrupts every ST_Contains/ST_Intersection
 * query against it (spatial join, "which zone is this street in", etc.) with
 * no clear error at the point of failure. Returns whether repair was needed
 * so the caller can warn the manager instead of silently accepting a shape
 * that isn't quite what they drew.
 */
export async function setZoneGeometry(
  zoneId: string,
  ring: LonLat[],
  options?: { allowRepair?: boolean }
): Promise<{ repaired: boolean }> {
  if (ring.length < 4) throw new Error("A polygon ring needs at least 4 points (closed)");
  const wkt = `POLYGON((${ring.map(([lon, lat]) => `${lon} ${lat}`).join(", ")}))`;

  const [{ wasValid }] = await prisma.$queryRaw<{ wasValid: boolean }[]>`
    SELECT ST_IsValid(ST_SetSRID(ST_GeomFromText(${wkt}), 4326)) as "wasValid"
  `;

  if (!wasValid && !options?.allowRepair) {
    throw new Error("הגבול שצוין אינו תקין גיאומטרית (מכיל הצטלבות עצמית)");
  }

  await prisma.$executeRaw`
    UPDATE zones
    SET geometry = ST_MakeValid(ST_SetSRID(ST_GeomFromText(${wkt}), 4326))
    WHERE id = ${zoneId}
  `;

  return { repaired: !wasValid };
}

export type StreetGeoJsonRow = {
  id: string;
  name: string;
  type: string;
  priority: string;
  zoneId: string | null;
  zoneName: string | null;
  lengthM: number | null;
  cleaningFrequency: unknown;
  estimatedCleanMinutes: number | null;
  notes: string | null;
  dirtScore: number | null;
  dataMode: string | null;
  confidence: string | null;
  accessIssue: boolean | null;
  isDemo: boolean;
  geojson: string | null;
};

/** All active streets as a FeatureCollection-ready row set for the map. */
export async function getStreetsAsGeoJson() {
  const rows = await prisma.$queryRaw<StreetGeoJsonRow[]>`
    SELECT s.id, s.name, s.type::text as type, s.priority::text as priority,
           s.zone_id as "zoneId", z.name as "zoneName", s.length_m as "lengthM",
           s.cleaning_frequency as "cleaningFrequency", s.estimated_clean_minutes as "estimatedCleanMinutes",
           s.notes, s.is_demo as "isDemo",
           p.dirt_score as "dirtScore", p.data_mode::text as "dataMode", p.confidence::text as "confidence",
           p.access_issue as "accessIssue",
           ST_AsGeoJSON(s.geometry) as geojson
    FROM streets s
    LEFT JOIN zones z ON z.id = s.zone_id
    LEFT JOIN street_cleaning_profiles p ON p.street_id = s.id
    WHERE s.active = true AND s.geometry IS NOT NULL
  `;
  return {
    type: "FeatureCollection" as const,
    features: rows
      .filter((r) => r.geojson)
      .map((r) => ({
        type: "Feature" as const,
        geometry: JSON.parse(r.geojson as string),
        properties: {
          id: r.id,
          name: r.name,
          type: r.type,
          priority: r.priority,
          zoneId: r.zoneId,
          zoneName: r.zoneName,
          lengthM: r.lengthM,
          cleaningFrequency: r.cleaningFrequency,
          estimatedCleanMinutes: r.estimatedCleanMinutes,
          notes: r.notes,
          dirtScore: r.dirtScore,
          dataMode: r.dataMode,
          confidence: r.confidence,
          accessIssue: r.accessIssue,
          isDemo: r.isDemo,
        },
      })),
  };
}

export type ZoneGeoJsonRow = {
  id: string;
  name: string;
  code: string;
  color: string;
  zoneNumber: number | null;
  contractAreaId: string | null;
  contractAreaNumber: number | null;
  contractAreaName: string | null;
  contractorName: string | null;
  contractAreaStatus: string;
  verificationStatus: string;
  geojson: string | null;
};

/**
 * Zones for the map, carrying their contract area so the map can colour by
 * contractor as well as by zone — and so an unassigned zone can be drawn as
 * unassigned rather than silently blending in.
 */
export async function getZonesAsGeoJson() {
  const rows = await prisma.$queryRaw<ZoneGeoJsonRow[]>`
    SELECT z.id, z.name, z.code, z.color,
           z.zone_number           AS "zoneNumber",
           z.contract_area_id      AS "contractAreaId",
           ca.area_number          AS "contractAreaNumber",
           ca.name                 AS "contractAreaName",
           c.name                  AS "contractorName",
           z.contract_area_status::text AS "contractAreaStatus",
           z.verification_status::text  AS "verificationStatus",
           ST_AsGeoJSON(z.geometry) AS geojson
    FROM zones z
    LEFT JOIN contract_areas ca ON ca.id = z.contract_area_id
    LEFT JOIN contractors c ON c.id = ca.contractor_id
    WHERE z.active = true
    ORDER BY z.zone_number NULLS LAST, z.code
  `;
  return {
    type: "FeatureCollection" as const,
    features: rows
      .filter((r) => r.geojson)
      .map((r) => ({
        type: "Feature" as const,
        geometry: JSON.parse(r.geojson as string),
        properties: {
          id: r.id,
          name: r.name,
          code: r.code,
          color: r.color,
          zoneNumber: r.zoneNumber,
          contractAreaId: r.contractAreaId,
          contractAreaNumber: r.contractAreaNumber,
          contractAreaName: r.contractAreaName,
          contractorName: r.contractorName,
          contractAreaStatus: r.contractAreaStatus,
          verificationStatus: r.verificationStatus,
        },
      })),
  };
}

/** Zones without geometry — surfaced so the map can say so explicitly. */
export async function getZonesWithoutGeometry() {
  return prisma.$queryRaw<{ id: string; name: string; code: string; color: string }[]>`
    SELECT id, name, code, color
    FROM zones
    WHERE active = true AND geometry IS NULL
    ORDER BY zone_number NULLS LAST, code
  `;
}

/** Raw [lon,lat][] coordinate arrays for a set of streets, keyed by street id — used to draw per-resource routes. */
export async function getStreetGeometryForTasks(streetIds: string[]): Promise<Map<string, LonLat[]>> {
  if (streetIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ id: string; geojson: string | null }[]>`
    SELECT id, ST_AsGeoJSON(geometry) as geojson
    FROM streets
    WHERE id = ANY(${streetIds})
  `;
  const map = new Map<string, LonLat[]>();
  for (const r of rows) {
    if (!r.geojson) continue;
    const geom = JSON.parse(r.geojson) as { type: string; coordinates: LonLat[] };
    if (geom.type === "LineString") map.set(r.id, geom.coordinates);
  }
  return map;
}

export type SegmentGeoJsonRow = {
  id: string;
  streetId: string;
  streetName: string;
  streetType: string;
  zoneId: string | null;
  zoneName: string | null;
  zoneCode: string | null;
  zoneColor: string | null;
  contractAreaNumber: number | null;
  lengthM: number | null;
  crossesZones: boolean;
  manuallyOverridden: boolean;
  verificationStatus: string;
  geojson: string | null;
};

/**
 * Street segments produced by the spatial join, for the map's per-zone layer.
 * Distinct from the streets layer: a street crossing a boundary appears once
 * per zone here, each part in that zone's colour.
 */
export async function getSegmentsAsGeoJson() {
  const rows = await prisma.$queryRaw<SegmentGeoJsonRow[]>`
    SELECT seg.id,
           seg.street_id            AS "streetId",
           s.name                   AS "streetName",
           s.type::text             AS "streetType",
           seg.zone_id              AS "zoneId",
           z.name                   AS "zoneName",
           z.code                   AS "zoneCode",
           z.color                  AS "zoneColor",
           ca.area_number           AS "contractAreaNumber",
           seg.length_m             AS "lengthM",
           seg.crosses_zones        AS "crossesZones",
           seg.manually_overridden  AS "manuallyOverridden",
           seg.verification_status::text AS "verificationStatus",
           ST_AsGeoJSON(seg.geometry) AS geojson
    FROM street_segments seg
    JOIN streets s ON s.id = seg.street_id
    LEFT JOIN zones z ON z.id = seg.zone_id
    LEFT JOIN contract_areas ca ON ca.id = z.contract_area_id
    WHERE seg.geometry IS NOT NULL
  `;
  return {
    type: "FeatureCollection" as const,
    features: rows
      .filter((r) => r.geojson)
      .map((r) => ({
        type: "Feature" as const,
        geometry: JSON.parse(r.geojson as string),
        properties: {
          id: r.id,
          streetId: r.streetId,
          streetName: r.streetName,
          streetType: r.streetType,
          zoneId: r.zoneId,
          zoneName: r.zoneName,
          zoneCode: r.zoneCode,
          zoneColor: r.zoneColor ?? "#94a3b8",
          contractAreaNumber: r.contractAreaNumber,
          lengthM: r.lengthM,
          crossesZones: r.crossesZones,
          manuallyOverridden: r.manuallyOverridden,
          verificationStatus: r.verificationStatus,
        },
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
