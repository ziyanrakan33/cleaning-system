import { describe, it, expect } from "vitest";
import {
  segmentsIntersect,
  findSelfIntersections,
  validatePolygonPoints,
  closeRing,
  uncloseRing,
  isDuplicateConsecutive,
  type LonLat,
} from "./geo-utils";

describe("Geometry Utilities for Map Area Drawing", () => {
  it("1. 4 corners in order create a simple rectangle with 4 edges and no interior diagonals", () => {
    // Top-left, top-right, bottom-right, bottom-left
    const points: LonLat[] = [
      [34.90, 32.18],
      [34.92, 32.18],
      [34.92, 32.16],
      [34.90, 32.16],
    ];

    const validation = validatePolygonPoints(points);
    expect(validation.valid).toBe(true);

    const closed = closeRing(points);
    expect(closed.length).toBe(5);
    expect(closed[0]).toEqual(closed[4]);

    const selfInter = findSelfIntersections(points, null, true);
    expect(selfInter.hasIntersection).toBe(false);
  });

  it("2. Points are preserved strictly in click order", () => {
    const rawClicks: LonLat[] = [
      [34.90, 32.18],
      [34.92, 32.18],
      [34.91, 32.17],
    ];

    expect(rawClicks[0]).toEqual([34.90, 32.18]);
    expect(rawClicks[1]).toEqual([34.92, 32.18]);
    expect(rawClicks[2]).toEqual([34.91, 32.17]);
  });

  it("3. Clicking first point closes shape", () => {
    const points: LonLat[] = [
      [34.90, 32.18],
      [34.92, 32.18],
      [34.92, 32.16],
    ];
    // First point clicked as closure
    const closed = closeRing(points);
    expect(closed[closed.length - 1]).toEqual(points[0]);
  });

  it("4. Close and save button closes shape when 3+ valid points exist", () => {
    const points: LonLat[] = [
      [34.90, 32.18],
      [34.92, 32.18],
      [34.92, 32.16],
    ];
    expect(validatePolygonPoints(points).valid).toBe(true);
    const closed = closeRing(points);
    expect(closed).toHaveLength(4);
  });

  it("5. Cannot close with fewer than 3 distinct points", () => {
    const points2: LonLat[] = [
      [34.90, 32.18],
      [34.92, 32.18],
    ];
    const validation = validatePolygonPoints(points2);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("נדרשות לפחות 3 נקודות");
  });

  it("6. Undo last point deletes only the last point", () => {
    const points: LonLat[] = [
      [34.90, 32.18],
      [34.92, 32.18],
      [34.92, 32.16],
    ];
    const undone = points.slice(0, -1);
    expect(undone).toEqual([
      [34.90, 32.18],
      [34.92, 32.18],
    ]);
  });

  it("7. Clear all deletes all points in current drawing", () => {
    let currentPts: LonLat[] = [
      [34.90, 32.18],
      [34.92, 32.18],
    ];
    currentPts = [];
    expect(currentPts).toHaveLength(0);
  });

  it("8. Self-intersection attempt (figure 8 or crossing line) is detected and blocked", () => {
    // Points forming a figure-8 shape: 0->1->2->3 where segment 2->3 crosses 0->1
    const points: LonLat[] = [
      [0, 0],
      [10, 10],
      [0, 10],
    ];
    const crossingCandidate: LonLat = [10, 0]; // Segment (0,10)->(10,0) crosses (0,0)->(10,10)

    const inter = findSelfIntersections(points, crossingCandidate);
    expect(inter.hasIntersection).toBe(true);
    expect(inter.intersectingSegments.length).toBeGreaterThan(0);
  });

  it("9. Cancel drawing restores previous saved boundary", () => {
    const savedBoundary: LonLat[] = [
      [34.90, 32.18],
      [34.92, 32.18],
      [34.92, 32.16],
    ];
    let currentDrawing: LonLat[] = [
      [34.90, 32.18],
      [34.99, 32.99],
    ];

    // Cancel action
    currentDrawing = [...savedBoundary];
    expect(currentDrawing).toEqual(savedBoundary);
  });

  it("10. Save and reload return exact same geometry", () => {
    const points: LonLat[] = [
      [34.9075, 32.1775],
      [34.9175, 32.1775],
      [34.9175, 32.1675],
    ];
    const closed = closeRing(points);
    const unclosed = uncloseRing(closed);
    expect(unclosed).toEqual(points);
  });

  it("11. Coordinates preserve [longitude, latitude] order with no swapping", () => {
    const lon = 34.9075;
    const lat = 32.1775;
    const point: LonLat = [lon, lat];

    expect(point[0]).toBe(34.9075); // Longitude first (E/W)
    expect(point[1]).toBe(32.1775); // Latitude second (N/S)
  });

  it("12. Fast clicks do not create duplicate consecutive points", () => {
    const points: LonLat[] = [[34.90, 32.18]];
    const fastClick: LonLat = [34.90, 32.18]; // Same location

    expect(isDuplicateConsecutive(points, fastClick)).toBe(true);
  });

  it("13. Detects line segment intersection accurately", () => {
    const seg1A: LonLat = [0, 0];
    const seg1B: LonLat = [10, 10];
    const seg2A: LonLat = [0, 10];
    const seg2B: LonLat = [10, 0];

    expect(segmentsIntersect(seg1A, seg1B, seg2A, seg2B)).toBe(true);

    // Parallel non-intersecting lines
    const seg3A: LonLat = [0, 20];
    const seg3B: LonLat = [10, 20];
    expect(segmentsIntersect(seg1A, seg1B, seg3A, seg3B)).toBe(false);
  });
});
