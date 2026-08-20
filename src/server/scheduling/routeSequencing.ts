import type { DueStreet } from "./dueStreets";
import { roadNetworkRouting, type LonLat } from "@/server/routing/graph";

export type SequencedStop = {
  street: DueStreet;
  distanceFromPrevM: number;
};

/**
 * Orders a resource's assigned streets into a route using the real road
 * network: nearest-neighbor construction, then 2-opt improvement (both
 * standard VRP/TSP heuristics — no black-box "AI").
 *
 * Each street is entered at its start point and left at its end point,
 * mirroring how a crew actually works down a street.
 */
export function sequenceRoute(streets: DueStreet[]): SequencedStop[] {
  if (streets.length === 0) return [];
  if (streets.length === 1) {
    return [{ street: streets[0], distanceFromPrevM: 0 }];
  }

  const endpoint = (s: DueStreet, end: "start" | "end"): LonLat => {
    if (end === "start" && s.startPointLon != null && s.startPointLat != null) return [s.startPointLon, s.startPointLat];
    if (end === "end" && s.endPointLon != null && s.endPointLat != null) return [s.endPointLon, s.endPointLat];
    // Fallback if a street is missing point data (shouldn't happen for OSM-imported streets).
    return [s.startPointLon ?? s.endPointLon ?? 0, s.startPointLat ?? s.endPointLat ?? 0];
  };

  // --- Nearest-neighbor construction ---
  const remaining = new Set(streets.map((_, i) => i));
  const order: number[] = [];
  const current = 0;
  order.push(current);
  remaining.delete(current);
  let currentPos = endpoint(streets[current], "end");

  while (remaining.size > 0) {
    let best = -1;
    let bestDist = Infinity;
    for (const idx of remaining) {
      const d = roadNetworkRouting.distanceMeters(currentPos, endpoint(streets[idx], "start"));
      if (d < bestDist) {
        bestDist = d;
        best = idx;
      }
    }
    order.push(best);
    remaining.delete(best);
    currentPos = endpoint(streets[best], "end");
  }

  // --- 2-opt improvement on the resulting path ---
  function routeDistance(seq: number[]): number {
    let total = 0;
    for (let i = 0; i < seq.length - 1; i++) {
      total += roadNetworkRouting.distanceMeters(endpoint(streets[seq[i]], "end"), endpoint(streets[seq[i + 1]], "start"));
    }
    return total;
  }

  let improved = true;
  let bestOrder = order;
  let bestDistance = routeDistance(bestOrder);
  let iterations = 0;
  // Full route recomputation per 2-opt candidate is O(n) — fine for the
  // route sizes a single resource gets in a day; skip for pathological
  // cases so plan generation never stalls.
  const MAX_ITERATIONS = streets.length <= 25 ? 200 : 0;

  while (improved && iterations < MAX_ITERATIONS) {
    improved = false;
    for (let i = 0; i < bestOrder.length - 1 && !improved; i++) {
      for (let j = i + 1; j < bestOrder.length; j++) {
        const candidate = [
          ...bestOrder.slice(0, i),
          ...bestOrder.slice(i, j + 1).reverse(),
          ...bestOrder.slice(j + 1),
        ];
        const candidateDistance = routeDistance(candidate);
        if (candidateDistance < bestDistance - 1) {
          bestOrder = candidate;
          bestDistance = candidateDistance;
          improved = true;
          break;
        }
      }
      iterations++;
    }
  }

  const stops: SequencedStop[] = [];
  let prevPos: LonLat | null = null;
  for (const idx of bestOrder) {
    const street = streets[idx];
    const distanceFromPrevM = prevPos ? roadNetworkRouting.distanceMeters(prevPos, endpoint(street, "start")) : 0;
    stops.push({ street, distanceFromPrevM });
    prevPos = endpoint(street, "end");
  }
  return stops;
}
