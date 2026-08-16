/**
 * Real road-network routing over the graph built by scripts/build-road-graph.ts
 * (all OSM highway ways in Kfar Saba, not just the named ones in `streets`).
 *
 * `RoutingProvider` is the seam for swapping this out for OSRM/GraphHopper
 * later without touching the scheduling engine — same interface, different
 * implementation.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export type LonLat = [number, number];

export interface RoutingProvider {
  distanceMeters(a: LonLat, b: LonLat): number;
}

type GraphFile = { nodes: LonLat[]; adjacency: Array<Array<[number, number]>> };

let cachedGraph: GraphFile | null = null;

function loadGraph(): GraphFile {
  if (cachedGraph) return cachedGraph;
  const filePath = path.join(process.cwd(), "data", "kfar-saba-road-graph.json");
  const raw = readFileSync(filePath, "utf-8");
  cachedGraph = JSON.parse(raw) as GraphFile;
  return cachedGraph;
}

function haversineM(a: LonLat, b: LonLat): number {
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

/** Nearest graph node to an arbitrary point, via a coarse grid index for speed. */
class NearestNodeIndex {
  private cellSizeDeg = 0.003; // ~300m
  private cells = new Map<string, number[]>();
  private nodes: LonLat[];

  constructor(nodes: LonLat[]) {
    this.nodes = nodes;
    nodes.forEach(([lon, lat], idx) => {
      const key = this.cellKey(lon, lat);
      const arr = this.cells.get(key);
      if (arr) arr.push(idx);
      else this.cells.set(key, [idx]);
    });
  }

  private cellKey(lon: number, lat: number): string {
    return `${Math.floor(lon / this.cellSizeDeg)},${Math.floor(lat / this.cellSizeDeg)}`;
  }

  nearest(point: LonLat): number {
    const [lon, lat] = point;
    const cx = Math.floor(lon / this.cellSizeDeg);
    const cy = Math.floor(lat / this.cellSizeDeg);
    let best = -1;
    let bestDist = Infinity;
    for (let ring = 0; ring < 6 && best === -1; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const candidates = this.cells.get(`${cx + dx},${cy + dy}`);
          if (!candidates) continue;
          for (const idx of candidates) {
            const d = haversineM(point, this.nodes[idx]);
            if (d < bestDist) {
              bestDist = d;
              best = idx;
            }
          }
        }
      }
    }
    return best;
  }
}

let cachedIndex: NearestNodeIndex | null = null;
function getIndex(): NearestNodeIndex {
  if (!cachedIndex) cachedIndex = new NearestNodeIndex(loadGraph().nodes);
  return cachedIndex;
}

/** Dijkstra shortest path from node `from` to node `to`, both graph node indices. */
function dijkstra(from: number, to: number, graph: GraphFile): number {
  if (from === to) return 0;
  const dist = new Float64Array(graph.nodes.length).fill(Infinity);
  const visited = new Uint8Array(graph.nodes.length);
  dist[from] = 0;

  // Simple binary-heap-free priority queue (array scan) is too slow for 12k
  // nodes done many times; use a small binary heap.
  const heap: Array<[number, number]> = [[0, from]]; // [dist, node]
  const heapPush = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const heapPop = (): [number, number] | undefined => {
    if (heap.length === 0) return undefined;
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        let smallest = i;
        if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l;
        if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r;
        if (smallest === i) break;
        [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
        i = smallest;
      }
    }
    return top;
  };

  while (heap.length > 0) {
    const [d, u] = heapPop()!;
    if (visited[u]) continue;
    visited[u] = 1;
    if (u === to) return d;
    for (const [v, w] of graph.adjacency[u]) {
      const nd = d + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        heapPush([nd, v]);
      }
    }
  }
  return Infinity;
}

const distanceCache = new Map<string, number>();

export const roadNetworkRouting: RoutingProvider = {
  distanceMeters(a: LonLat, b: LonLat): number {
    const graph = loadGraph();
    const index = getIndex();
    const fromNode = index.nearest(a);
    const toNode = index.nearest(b);
    if (fromNode === -1 || toNode === -1) return haversineM(a, b);

    const cacheKey = fromNode < toNode ? `${fromNode}-${toNode}` : `${toNode}-${fromNode}`;
    const cached = distanceCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const d = dijkstra(fromNode, toNode, graph);
    const result = Number.isFinite(d) ? d : haversineM(a, b);
    distanceCache.set(cacheKey, result);
    return result;
  },
};
