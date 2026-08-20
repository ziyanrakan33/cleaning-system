export type LonLat = [number, number];

export function isSamePoint(p1: LonLat, p2: LonLat, eps = 1e-9): boolean {
  return Math.abs(p1[0] - p2[0]) <= eps && Math.abs(p1[1] - p2[1]) <= eps;
}

export function isDuplicateConsecutive(points: LonLat[], candidate: LonLat, eps = 1e-7): boolean {
  if (points.length === 0) return false;
  const last = points[points.length - 1];
  return isSamePoint(last, candidate, eps);
}

/**
 * 2D Orientation test.
 * 0 -> Collinear
 * 1 -> Clockwise
 * 2 -> Counterclockwise
 */
function ccw(p: LonLat, q: LonLat, r: LonLat): number {
  const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(val) < 1e-10) return 0;
  return val > 0 ? 1 : 2;
}

/**
 * Given three collinear points p, q, r, check if point q lies on line segment 'pr'
 */
function onSegment(p: LonLat, q: LonLat, r: LonLat): boolean {
  return (
    q[0] <= Math.max(p[0], r[0]) + 1e-10 &&
    q[0] >= Math.min(p[0], r[0]) - 1e-10 &&
    q[1] <= Math.max(p[1], r[1]) + 1e-10 &&
    q[1] >= Math.min(p[1], r[1]) - 1e-10
  );
}

/**
 * Checks if line segment p1-p2 intersects line segment p3-p4.
 * Returns false if segments only share an endpoint.
 */
export function segmentsIntersect(p1: LonLat, p2: LonLat, p3: LonLat, p4: LonLat): boolean {
  // Shared endpoints are not considered self-intersection
  if (isSamePoint(p1, p3) || isSamePoint(p1, p4) || isSamePoint(p2, p3) || isSamePoint(p2, p4)) {
    return false;
  }

  const o1 = ccw(p1, p2, p3);
  const o2 = ccw(p1, p2, p4);
  const o3 = ccw(p3, p4, p1);
  const o4 = ccw(p3, p4, p2);

  // General case
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  // Special Collinear cases
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;

  return false;
}

export type IntersectionResult = {
  hasIntersection: boolean;
  intersectingSegments: [LonLat, LonLat][];
};

/**
 * Checks if adding candidateNewPoint to points (or closing points) creates any self-intersection.
 */
export function findSelfIntersections(
  points: LonLat[],
  candidateNewPoint?: LonLat | null,
  isClosing?: boolean
): IntersectionResult {
  const result: IntersectionResult = {
    hasIntersection: false,
    intersectingSegments: [],
  };

  if (points.length < 2 && !candidateNewPoint) {
    return result;
  }

  if (candidateNewPoint || isClosing) {
    if (points.length < 2) return result;

    const pLast = points[points.length - 1];
    const targetPoint = isClosing ? points[0] : candidateNewPoint!;

    // Candidate segment is (pLast -> targetPoint)
    const newSeg: [LonLat, LonLat] = [pLast, targetPoint];

    // Compare newSeg against all existing segments (p_i -> p_{i+1})
    // For isClosing, skip segment 0 (p_0 -> p_1) because targetPoint is p_0
    const startIndex = 0;
    const endIndex = isClosing ? points.length - 2 : points.length - 2;

    for (let i = startIndex; i <= endIndex; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      if (segmentsIntersect(newSeg[0], newSeg[1], p1, p2)) {
        result.hasIntersection = true;
        result.intersectingSegments.push(newSeg, [p1, p2]);
      }
    }
    return result;
  }

  // Check all non-adjacent pairs in points
  const segCount = points.length - 1;
  for (let i = 0; i < segCount; i++) {
    const seg1: [LonLat, LonLat] = [points[i], points[i + 1]];
    for (let j = i + 2; j < segCount; j++) {
      // If loop is closed, skip first and last segment sharing point 0
      if (i === 0 && j === segCount - 1 && isSamePoint(points[0], points[points.length - 1])) {
        continue;
      }
      const seg2: [LonLat, LonLat] = [points[j], points[j + 1]];
      if (segmentsIntersect(seg1[0], seg1[1], seg2[0], seg2[1])) {
        result.hasIntersection = true;
        result.intersectingSegments.push(seg1, seg2);
      }
    }
  }

  return result;
}

/**
 * Validates array of points for a polygon.
 */
export function validatePolygonPoints(points: LonLat[]): { valid: boolean; error?: string } {
  if (points.length < 3) {
    return { valid: false, error: "נדרשות לפחות 3 נקודות שונות לסגירת אזור" };
  }

  for (let i = 0; i < points.length; i++) {
    const [lon, lat] = points[i];
    if (typeof lon !== "number" || typeof lat !== "number" || isNaN(lon) || isNaN(lat)) {
      return { valid: false, error: `קואורדינטות לא תקינות בנקודה ${i + 1}` };
    }
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return { valid: false, error: `קואורדינטות מחוץ לטווח התקין בנקודה ${i + 1}` };
    }
  }

  for (let i = 0; i < points.length - 1; i++) {
    if (isSamePoint(points[i], points[i + 1])) {
      return { valid: false, error: `קיימות נקודות כפולות רצופות במיקום ${i + 1}` };
    }
  }

  const selfInter = findSelfIntersections(points);
  if (selfInter.hasIntersection) {
    return { valid: false, error: "הגבול חוצה את עצמו (הצטלבות עצמית)" };
  }

  const closingInter = findSelfIntersections(points, null, true);
  if (closingInter.hasIntersection) {
    return { valid: false, error: "קו הסגירה של הגבול חוצה קטע קודם (הצטלבות עצמית)" };
  }

  return { valid: true };
}

export function closeRing(points: LonLat[]): LonLat[] {
  if (points.length === 0) return [];
  if (isSamePoint(points[0], points[points.length - 1])) {
    return points;
  }
  return [...points, points[0]];
}

export function uncloseRing(ring: LonLat[]): LonLat[] {
  if (ring.length > 3 && isSamePoint(ring[0], ring[ring.length - 1])) {
    return ring.slice(0, -1);
  }
  return ring;
}
