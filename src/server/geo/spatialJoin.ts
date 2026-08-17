import { prisma } from "@/lib/prisma";

/**
 * Assigns streets and paths to operational zones by real geometry rather than
 * by name or by a single representative point.
 *
 * A street that crosses a zone boundary is split with ST_Intersection into one
 * StreetSegment per zone, so its length is attributed to the zone it actually
 * runs through. Assigning a whole street by its midpoint — which is what
 * `suggestZoneForStreet` in geo.service.ts does — would credit the wrong zone
 * with kilometres it never cleans.
 *
 * Re-running is safe: any street a manager has corrected by hand is skipped
 * entirely, so automated recomputation can never undo a human decision.
 */

/**
 * Segments shorter than this are almost always slivers where a street clips the
 * corner of a neighbouring zone's polygon, not real work. They are still
 * recorded, but flagged for review instead of being silently counted.
 */
export const MIN_CONFIDENT_SEGMENT_M = 15;

export type ZoneCoverage = {
  zoneId: string;
  code: string;
  name: string;
  zoneNumber: number | null;
  segments: number;
  streets: number;
  paths: number;
  lengthM: number;
};

export type SpatialJoinResult = {
  zonesWithGeometry: number;
  zonesWithoutGeometry: number;
  streetsWithGeometry: number;
  segmentsCreated: number;
  streetsAssigned: number;
  streetsCrossingZones: number;
  streetsUnassigned: number;
  segmentsRequiringReview: number;
  protectedStreets: number;
  coverage: ZoneCoverage[];
};

/**
 * Streets that automated recomputation must not touch: either a segment of the
 * street was corrected by hand, or a manager overrode the street's zone.
 */
async function getProtectedStreetIds(): Promise<Set<string>> {
  const [manualSegments, overrides] = await Promise.all([
    prisma.streetSegment.findMany({
      where: { manuallyOverridden: true },
      select: { streetId: true },
      distinct: ["streetId"],
    }),
    prisma.manualOverride.findMany({
      where: { entityType: "Street", fieldName: "zoneId" },
      select: { entityId: true },
    }),
  ]);

  return new Set([
    ...manualSegments.map((s) => s.streetId),
    ...overrides.map((o) => o.entityId),
  ]);
}

/**
 * Drops the zone link and the crossing flag from every street the join
 * produced no segments for.
 *
 * The `crosses_zones` half matters on its own: a street can end up flagged as
 * crossing while its `zone_id` is already null, and testing only `zone_id IS
 * NOT NULL` would leave that flag set forever — reporting phantom
 * boundary-crossing streets long after the boundaries changed.
 */
async function clearStreetsWithoutSegments(protectedList: string[]) {
  await prisma.$executeRaw`
    UPDATE streets s
    SET zone_id = NULL, crosses_zones = false
    WHERE (s.zone_id IS NOT NULL OR s.crosses_zones = true)
      AND NOT (s.id = ANY(${protectedList}::text[]))
      AND NOT EXISTS (SELECT 1 FROM street_segments seg WHERE seg.street_id = s.id)
  `;
}

export async function runSpatialJoin(): Promise<SpatialJoinResult> {
  const [zonesWithGeometry, zonesTotal] = await Promise.all([
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM zones WHERE active = true AND geometry IS NOT NULL
    `.then((r) => Number(r[0].n)),
    prisma.operationalZone.count({ where: { active: true } }),
  ]);

  const protectedIds = await getProtectedStreetIds();
  const protectedList = [...protectedIds];

  // Clear only what we are about to regenerate. Hand-corrected segments stay.
  if (protectedList.length > 0) {
    await prisma.streetSegment.deleteMany({
      where: { manuallyOverridden: false, streetId: { notIn: protectedList } },
    });
  } else {
    await prisma.streetSegment.deleteMany({ where: { manuallyOverridden: false } });
  }

  let segmentsCreated = 0;

  if (zonesWithGeometry > 0) {
    // One statement rather than a round trip per street: 1,100+ streets against
    // 10 polygons is a job for PostGIS, not for the application.
    segmentsCreated = await prisma.$executeRaw`
      WITH parts AS (
        SELECT s.id AS street_id,
               z.id AS zone_id,
               (ST_Dump(ST_Intersection(s.geometry, z.geometry))).geom AS geom
        FROM streets s
        JOIN zones z
          ON z.active = true
         AND z.geometry IS NOT NULL
         AND ST_Intersects(s.geometry, z.geometry)
        WHERE s.active = true
          AND s.geometry IS NOT NULL
          AND NOT (s.id = ANY(${protectedList}::text[]))
      ),
      lines AS (
        -- ST_Intersection also yields points where a street merely grazes a
        -- polygon corner; those are not segments of work.
        SELECT street_id, zone_id, geom,
               ST_Length(geom::geography) AS len
        FROM parts
        WHERE GeometryType(geom) = 'LINESTRING'
          AND ST_Length(geom::geography) >= 0.5
      ),
      zone_counts AS (
        SELECT street_id, COUNT(DISTINCT zone_id) AS n_zones
        FROM lines GROUP BY street_id
      )
      INSERT INTO street_segments (
        id, street_id, zone_id, segment_index, length_m, geometry,
        verification_status, confidence, crosses_zones, manually_overridden,
        created_at, updated_at
      )
      SELECT
        'seg_' || replace(gen_random_uuid()::text, '-', ''),
        l.street_id,
        l.zone_id,
        (ROW_NUMBER() OVER (PARTITION BY l.street_id ORDER BY l.len DESC, l.zone_id))::int - 1,
        l.len,
        l.geom,
        CASE WHEN l.len < ${MIN_CONFIDENT_SEGMENT_M}
             THEN 'REQUIRES_REVIEW'::"VerificationStatus"
             ELSE 'EXTRACTED'::"VerificationStatus" END,
        CASE WHEN l.len < ${MIN_CONFIDENT_SEGMENT_M}
             THEN 'LOW'::"ConfidenceLevel"
             WHEN zc.n_zones > 1
             THEN 'MEDIUM'::"ConfidenceLevel"
             ELSE 'HIGH'::"ConfidenceLevel" END,
        zc.n_zones > 1,
        false,
        NOW(), NOW()
      FROM lines l
      JOIN zone_counts zc ON zc.street_id = l.street_id
    `;

    // Keep Street.zoneId meaningful for everything already built on it (the
    // scheduling engine, the streets screen, resource zone restrictions): point
    // it at the zone holding the greatest share of the street's length.
    await prisma.$executeRaw`
      UPDATE streets s
      SET zone_id = best.zone_id,
          crosses_zones = best.n_zones > 1
      FROM (
        SELECT DISTINCT ON (street_id)
               street_id, zone_id, n_zones
        FROM (
          SELECT street_id, zone_id,
                 SUM(length_m) AS zone_len,
                 COUNT(*) OVER (PARTITION BY street_id) AS n_zones
          FROM street_segments
          WHERE zone_id IS NOT NULL
          GROUP BY street_id, zone_id
        ) agg
        ORDER BY street_id, zone_len DESC, zone_id
      ) best
      WHERE s.id = best.street_id
        AND NOT (s.id = ANY(${protectedList}::text[]))
    `;

    await clearStreetsWithoutSegments(protectedList);
  } else {
    // No zone has a boundary yet, so nothing can be attributed. Clear any
    // assignment left over from a previous run rather than showing stale
    // zone links and crossing flags against zones that no longer apply.
    await clearStreetsWithoutSegments(protectedList);
  }

  const [
    streetsWithGeometry,
    streetsAssigned,
    streetsCrossingZones,
    streetsUnassigned,
    segmentsRequiringReview,
    coverageRows,
  ] = await Promise.all([
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM streets WHERE active = true AND geometry IS NOT NULL
    `.then((r) => Number(r[0].n)),
    prisma.street.count({ where: { active: true, zoneId: { not: null } } }),
    prisma.street.count({ where: { active: true, crossesZones: true } }),
    prisma.street.count({ where: { active: true, zoneId: null } }),
    prisma.streetSegment.count({ where: { verificationStatus: "REQUIRES_REVIEW" } }),
    prisma.$queryRaw<
      {
        zoneId: string;
        code: string;
        name: string;
        zoneNumber: number | null;
        segments: bigint;
        streets: bigint;
        paths: bigint;
        lengthM: number | null;
      }[]
    >`
      SELECT z.id           AS "zoneId",
             z.code,
             z.name,
             z.zone_number  AS "zoneNumber",
             COUNT(seg.id)  AS segments,
             COUNT(DISTINCT CASE WHEN st.type = 'STREET' THEN st.id END) AS streets,
             COUNT(DISTINCT CASE WHEN st.type IN ('PATH', 'PEDESTRIAN_MALL') THEN st.id END) AS paths,
             COALESCE(SUM(seg.length_m), 0) AS "lengthM"
      FROM zones z
      LEFT JOIN street_segments seg ON seg.zone_id = z.id
      LEFT JOIN streets st ON st.id = seg.street_id
      WHERE z.active = true
      GROUP BY z.id, z.code, z.name, z.zone_number
      ORDER BY z.zone_number NULLS LAST, z.code
    `,
  ]);

  return {
    zonesWithGeometry,
    zonesWithoutGeometry: zonesTotal - zonesWithGeometry,
    streetsWithGeometry,
    segmentsCreated,
    streetsAssigned,
    streetsCrossingZones,
    streetsUnassigned,
    segmentsRequiringReview,
    protectedStreets: protectedIds.size,
    coverage: coverageRows.map((r) => ({
      zoneId: r.zoneId,
      code: r.code,
      name: r.name,
      zoneNumber: r.zoneNumber,
      segments: Number(r.segments),
      streets: Number(r.streets),
      paths: Number(r.paths),
      lengthM: r.lengthM ?? 0,
    })),
  };
}

/**
 * Records a manager's correction of a segment's zone and pins it so later runs
 * of the spatial join leave it alone.
 */
export async function overrideSegmentZone(opts: {
  segmentId: string;
  zoneId: string | null;
  userId: string;
  reason?: string;
}) {
  const segment = await prisma.streetSegment.findUnique({
    where: { id: opts.segmentId },
    include: { zone: { select: { code: true, name: true } }, street: { select: { name: true } } },
  });
  if (!segment) throw new Error("מקטע לא נמצא");

  const newZone = opts.zoneId
    ? await prisma.operationalZone.findUnique({
        where: { id: opts.zoneId },
        select: { code: true, name: true },
      })
    : null;

  const updated = await prisma.streetSegment.update({
    where: { id: opts.segmentId },
    data: {
      zoneId: opts.zoneId,
      manuallyOverridden: true,
      verificationStatus: "VERIFIED",
      confidence: "HIGH",
    },
  });

  await prisma.manualOverride.create({
    data: {
      entityType: "StreetSegment",
      entityId: opts.segmentId,
      fieldName: "zoneId",
      previousValue: segment.zone ? `${segment.zone.code} — ${segment.zone.name}` : null,
      newValue: newZone ? `${newZone.code} — ${newZone.name}` : null,
      reason: opts.reason ?? null,
      overriddenById: opts.userId,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "StreetSegment",
      entityId: opts.segmentId,
      action: "OVERRIDE_SEGMENT_ZONE",
      userId: opts.userId,
      before: { zoneId: segment.zoneId },
      after: { zoneId: opts.zoneId },
      description: `שיוך מקטע של "${segment.street.name}" תוקן ידנית ל-${
        newZone ? `${newZone.name} (${newZone.code})` : "ללא אזור"
      }`,
    },
  });

  return updated;
}
