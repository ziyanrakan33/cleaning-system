/**
 * Builds a real routable road-network graph for Kfar Saba from OpenStreetMap
 * and writes it to data/kfar-saba-road-graph.json.
 *
 * Unlike the `streets` table (which only holds ~1100 *named* ways for the
 * cleaning-plan UI), routing needs the *full* road network — including the
 * ~1800 unnamed service roads, footway stubs, and connector segments —
 * because those are what actually link named streets together at
 * intersections. This script fetches all of them.
 *
 * Nodes are keyed by rounded (lon,lat) — OSM ways that share an intersection
 * share the exact same node coordinates (they reference the same OSM node),
 * so no fuzzy spatial snapping is needed. Edge weight = real geodesic length
 * of that segment (haversine).
 *
 * Re-running regenerates the file from scratch (idempotent).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

const KFAR_SABA_RELATION_ID = 1383631;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const HIGHWAY_TYPES = [
  "primary", "secondary", "tertiary",
  "primary_link", "secondary_link", "tertiary_link",
  "residential", "living_street", "unclassified",
  "pedestrian", "footway", "path", "track", "cycleway", "steps", "service",
];

const query = `
[out:json][timeout:120];
area(${3600000000 + KFAR_SABA_RELATION_ID})->.a;
(
  way["highway"~"^(${HIGHWAY_TYPES.join("|")})$"](area.a);
);
out geom;
`;

type OverpassWay = { type: "way"; id: number; geometry: { lat: number; lon: number }[] };
type OverpassResponse = { elements: OverpassWay[] };

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nodeKey(lon: number, lat: number): string {
  return `${lon.toFixed(6)},${lat.toFixed(6)}`;
}

async function fetchOverpass(): Promise<OverpassResponse> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Querying ${endpoint} ...`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "*/*",
          "User-Agent": "kfar-saba-cleaning-planner/1.0 (road graph build script)",
        },
        body: query,
        signal: AbortSignal.timeout(150_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as OverpassResponse;
    } catch (e) {
      console.warn(`  failed: ${(e as Error).message}`);
      lastError = e;
    }
  }
  throw lastError;
}

async function main() {
  const data = await fetchOverpass();
  const ways = data.elements.filter((el) => el.type === "way" && el.geometry?.length >= 2);
  console.log(`Fetched ${ways.length} road ways.`);

  const nodeIndex = new Map<string, number>();
  const nodeCoords: [number, number][] = [];
  const adjacency: Array<Array<[number, number]>> = []; // [nodeIdx] -> [[neighborIdx, weightM], ...]

  function getOrCreateNode(lon: number, lat: number): number {
    const key = nodeKey(lon, lat);
    let idx = nodeIndex.get(key);
    if (idx === undefined) {
      idx = nodeCoords.length;
      nodeIndex.set(key, idx);
      nodeCoords.push([lon, lat]);
      adjacency.push([]);
    }
    return idx;
  }

  let edgeCount = 0;
  for (const way of ways) {
    const coords = way.geometry.map((p): [number, number] => [p.lon, p.lat]);
    for (let i = 0; i < coords.length - 1; i++) {
      const a = getOrCreateNode(coords[i][0], coords[i][1]);
      const b = getOrCreateNode(coords[i + 1][0], coords[i + 1][1]);
      if (a === b) continue;
      const w = haversineM(coords[i], coords[i + 1]);
      adjacency[a].push([b, w]);
      adjacency[b].push([a, w]);
      edgeCount++;
    }
  }

  console.log(`Graph: ${nodeCoords.length} nodes, ${edgeCount} edges.`);

  const outPath = path.join(process.cwd(), "data", "kfar-saba-road-graph.json");
  writeFileSync(outPath, JSON.stringify({ nodes: nodeCoords, adjacency }), "utf-8");
  console.log("Wrote", outPath);
}

main().catch((e) => {
  console.error("Failed to build road graph:", e);
  process.exit(1);
});
