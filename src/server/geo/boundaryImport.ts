import type { LonLat } from "@/server/geo.service";

/**
 * Parses a zone boundary out of a GeoJSON or KML file.
 *
 * Deliberately dependency-free: KML boundaries are a small, well-defined corner
 * of the format (a LinearRing's `<coordinates>` list), and pulling in a full XML
 * stack to read one element is not worth it.
 */

export type ParsedBoundary = {
  ring: LonLat[];
  /** Which shape was taken, when the file held more than one. */
  sourceName: string | null;
  warnings: string[];
};

export class BoundaryParseError extends Error {}

function isFiniteLonLat(p: unknown): p is LonLat {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    typeof p[0] === "number" &&
    typeof p[1] === "number" &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1])
  );
}

/** Rejects rings that are obviously not WGS84 lon/lat — e.g. ITM easting/northing. */
function assertWgs84(ring: LonLat[]) {
  const bad = ring.find(([lon, lat]) => lon < -180 || lon > 180 || lat < -90 || lat > 90);
  if (bad) {
    throw new BoundaryParseError(
      `הקואורדינטות אינן ב-WGS84 (lon/lat). נמצא ${bad[0]}, ${bad[1]}. ` +
        "אם הקובץ ברשת ישראל החדשה (ITM/EPSG:2039), יש להמיר אותו ל-EPSG:4326 לפני הייבוא."
    );
  }
}

/** Closes the ring and drops consecutive duplicate points. */
function normaliseRing(raw: LonLat[], warnings: string[]): LonLat[] {
  const deduped: LonLat[] = [];
  for (const p of raw) {
    const last = deduped[deduped.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) deduped.push(p);
  }

  // PostGIS wants an explicitly closed ring.
  const first = deduped[0];
  const last = deduped[deduped.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    deduped.push([first[0], first[1]]);
    warnings.push("הטבעת נסגרה אוטומטית (הנקודה הראשונה נוספה בסוף).");
  }

  if (deduped.length < 4) {
    throw new BoundaryParseError("גבול אזור מחייב לפחות 3 נקודות שונות.");
  }
  assertWgs84(deduped);
  return deduped;
}

function ringFromGeometry(
  geometry: { type?: string; coordinates?: unknown },
  warnings: string[]
): LonLat[] | null {
  if (geometry?.type === "Polygon") {
    const outer = (geometry.coordinates as unknown[])?.[0];
    if (Array.isArray(outer) && outer.every(isFiniteLonLat)) {
      if ((geometry.coordinates as unknown[]).length > 1) {
        warnings.push("הפוליגון כולל חורים פנימיים — יובא הגבול החיצוני בלבד.");
      }
      return outer as LonLat[];
    }
  }
  if (geometry?.type === "MultiPolygon") {
    const polys = geometry.coordinates as unknown[];
    if (Array.isArray(polys) && polys.length > 0) {
      if (polys.length > 1) {
        warnings.push(
          `הקובץ כולל ${polys.length} פוליגונים — יובא הגדול ביותר בלבד. לגבול מרובה חלקים יש לייבא כל חלק בנפרד.`
        );
      }
      // Pick the ring with the most points as a proxy for the main shape.
      let best: LonLat[] | null = null;
      for (const poly of polys) {
        const outer = (poly as unknown[])?.[0];
        if (Array.isArray(outer) && outer.every(isFiniteLonLat)) {
          if (!best || outer.length > best.length) best = outer as LonLat[];
        }
      }
      return best;
    }
  }
  return null;
}

export function parseGeoJsonBoundary(text: string): ParsedBoundary {
  const warnings: string[] = [];
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new BoundaryParseError("הקובץ אינו JSON תקין.");
  }

  const root = doc as {
    type?: string;
    features?: { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }[];
    geometry?: { type?: string; coordinates?: unknown };
    properties?: Record<string, unknown>;
    coordinates?: unknown;
  };

  let geometry: { type?: string; coordinates?: unknown } | undefined;
  let sourceName: string | null = null;

  if (root.type === "FeatureCollection") {
    const polygonFeature = (root.features ?? []).find(
      (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
    );
    if (!polygonFeature) {
      throw new BoundaryParseError("לא נמצא Polygon או MultiPolygon בקובץ.");
    }
    if ((root.features ?? []).length > 1) {
      warnings.push(`הקובץ כולל ${root.features!.length} תופעות — יובאה הראשונה מסוג פוליגון.`);
    }
    geometry = polygonFeature.geometry;
    sourceName = (polygonFeature.properties?.name ?? polygonFeature.properties?.Name ?? null) as string | null;
  } else if (root.type === "Feature") {
    geometry = root.geometry;
    sourceName = (root.properties?.name ?? root.properties?.Name ?? null) as string | null;
  } else if (root.type === "Polygon" || root.type === "MultiPolygon") {
    geometry = { type: root.type, coordinates: root.coordinates };
  }

  if (!geometry) throw new BoundaryParseError("לא נמצאה גיאומטריה בקובץ.");

  const raw = ringFromGeometry(geometry, warnings);
  if (!raw) throw new BoundaryParseError("הגיאומטריה בקובץ אינה פוליגון תקין.");

  return { ring: normaliseRing(raw, warnings), sourceName, warnings };
}

export function parseKmlBoundary(text: string): ParsedBoundary {
  const warnings: string[] = [];

  // KML polygons put the outer ring in outerBoundaryIs > LinearRing >
  // coordinates. Fall back to any LinearRing if the wrapper is absent.
  const outerMatches = [
    ...text.matchAll(
      /<outerBoundaryIs>\s*<LinearRing>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/gi
    ),
  ];
  const matches =
    outerMatches.length > 0
      ? outerMatches
      : [...text.matchAll(/<LinearRing>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/gi)];

  if (matches.length === 0) {
    throw new BoundaryParseError("לא נמצא גבול פוליגון (LinearRing) בקובץ ה-KML.");
  }
  if (matches.length > 1) {
    warnings.push(`הקובץ כולל ${matches.length} פוליגונים — יובא הגדול ביותר בלבד.`);
  }

  let best: LonLat[] = [];
  for (const m of matches) {
    const ring: LonLat[] = [];
    for (const token of m[1].trim().split(/\s+/)) {
      if (!token) continue;
      // "lon,lat" or "lon,lat,altitude"
      const [lonStr, latStr] = token.split(",");
      const lon = Number(lonStr);
      const lat = Number(latStr);
      if (Number.isFinite(lon) && Number.isFinite(lat)) ring.push([lon, lat]);
    }
    if (ring.length > best.length) best = ring;
  }

  if (best.length === 0) {
    throw new BoundaryParseError("לא ניתן לקרוא קואורדינטות מקובץ ה-KML.");
  }

  const nameMatch = text.match(/<name>([\s\S]*?)<\/name>/i);
  return {
    ring: normaliseRing(best, warnings),
    sourceName: nameMatch ? nameMatch[1].trim() : null,
    warnings,
  };
}

/** Dispatches on file extension, falling back to sniffing the content. */
export function parseBoundaryFile(filename: string, text: string): ParsedBoundary {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".kml")) return parseKmlBoundary(text);
  if (lower.endsWith(".geojson") || lower.endsWith(".json")) return parseGeoJsonBoundary(text);

  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) return parseGeoJsonBoundary(text);
  if (trimmed.startsWith("<")) return parseKmlBoundary(text);

  throw new BoundaryParseError(
    "סוג קובץ לא נתמך. ניתן לייבא GeoJSON (.geojson/.json) או KML (.kml). " +
      "קובץ SHP יש להמיר ל-GeoJSON לפני הייבוא."
  );
}
