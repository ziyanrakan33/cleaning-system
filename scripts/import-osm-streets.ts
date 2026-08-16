/**
 * Imports real Kfar Saba street/path geometry from OpenStreetMap (Overpass API)
 * into the `streets` table. Idempotent: re-running updates existing rows
 * (matched by osm_id) instead of duplicating them.
 *
 * Kfar Saba admin boundary = OSM relation 1383631 (verified via Nominatim).
 * Overpass area id = 3600000000 + relation id.
 *
 * Scope decision: only *named* ways are imported (~1100 of ~2900 highway
 * ways in the city). The other ~1800 are unnamed fragments (short service
 * driveways, parking-lot slivers, footway stubs) that don't correspond to
 * an operationally meaningful "street or path" a manager would schedule
 * cleaning for. Those can be added manually via the streets/paths screen
 * if a specific one turns out to matter. This keeps the seeded list real
 * and usable rather than 3000 anonymous rows.
 *
 * Uses `pg` directly (not the Prisma Neon adapter) — a long sequential
 * bulk load is more robust over a plain TCP connection than repeated
 * round trips on the serverless WebSocket adapter.
 */
import { Client } from "pg";
import crypto from "node:crypto";

const KFAR_SABA_RELATION_ID = 1383631;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const RELEVANT_HIGHWAY_TYPES = [
  "primary", "secondary", "tertiary",
  "primary_link", "secondary_link", "tertiary_link",
  "residential", "living_street", "unclassified",
  "pedestrian", "footway", "path", "track", "cycleway", "steps", "service",
];

const query = `
[out:json][timeout:120];
area(${3600000000 + KFAR_SABA_RELATION_ID})->.a;
(
  way["highway"~"^(${RELEVANT_HIGHWAY_TYPES.join("|")})$"](area.a);
);
out tags geom;
`;

type OverpassWay = {
  type: "way";
  id: number;
  geometry: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};
type OverpassResponse = { elements: OverpassWay[] };

function streetTypeFor(highway: string): string {
  if (highway === "pedestrian") return "PEDESTRIAN_MALL";
  if (["footway", "path", "track", "cycleway", "steps"].includes(highway)) return "PATH";
  if (["primary", "secondary", "tertiary", "primary_link", "secondary_link",
       "tertiary_link", "residential", "living_street", "unclassified", "service"].includes(highway)) {
    return "STREET";
  }
  return "OTHER";
}

function priorityFor(highway: string): string {
  if (["primary", "primary_link", "secondary", "secondary_link"].includes(highway)) return "HIGH";
  if (["tertiary", "tertiary_link", "residential", "living_street", "unclassified"].includes(highway)) return "NORMAL";
  return "LOW";
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
          "User-Agent": "kfar-saba-cleaning-planner/1.0 (municipal street data import script)",
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

function toWkt(coords: [number, number][]): string {
  return `LINESTRING(${coords.map(([lon, lat]) => `${lon} ${lat}`).join(", ")})`;
}

async function main() {
  const data = await fetchOverpass();
  const named = data.elements.filter((el) => el.type === "way" && el.tags?.name);
  const skipped = data.elements.length - named.length;
  console.log(`Fetched ${data.elements.length} ways, ${named.length} named, ${skipped} unnamed (skipped).`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const adminRes = await client.query(`SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`);
  if (adminRes.rows.length === 0) throw new Error("No admin user found — run scripts/seed-admin.ts first.");
  const adminId: string = adminRes.rows[0].id;

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < named.length; i++) {
    const way = named[i];
    const tags = way.tags!;
    const highway = tags.highway;
    const name = tags.name;
    const coords: [number, number][] = way.geometry.map((p) => [p.lon, p.lat]);
    const osmId = String(way.id);
    const type = streetTypeFor(highway);
    const priority = priorityFor(highway);
    const wkt = toWkt(coords);
    const [startLon, startLat] = coords[0];
    const [endLon, endLat] = coords[coords.length - 1];

    try {
      const existing = await client.query(`SELECT id FROM streets WHERE osm_id = $1`, [osmId]);

      if (existing.rows.length > 0) {
        const id = existing.rows[0].id;
        await client.query(
          `UPDATE streets SET name=$1, type=$2::"StreetType", priority=$3::"Priority",
             geometry = ST_SetSRID(ST_GeomFromText($4), 4326),
             length_m = ST_Length(ST_SetSRID(ST_GeomFromText($4), 4326)::geography),
             start_point_lon=$5, start_point_lat=$6, end_point_lon=$7, end_point_lat=$8,
             updated_at = now()
           WHERE id = $9`,
          [name, type, priority, wkt, startLon, startLat, endLon, endLat, id]
        );
        updated++;
      } else {
        const id = crypto.randomUUID();
        await client.query(
          `INSERT INTO streets
             (id, name, type, zone_id, priority, cleaning_frequency, source, osm_id,
              geometry, length_m, start_point_lon, start_point_lat, end_point_lon, end_point_lat,
              active, created_at, updated_at)
           VALUES
             ($1, $2, $3::"StreetType", NULL, $4::"Priority", $5::jsonb, 'OSM', $6,
              ST_SetSRID(ST_GeomFromText($7), 4326),
              ST_Length(ST_SetSRID(ST_GeomFromText($7), 4326)::geography),
              $8, $9, $10, $11, true, now(), now())`,
          [id, name, type, priority, JSON.stringify({ type: "WEEKLY" }), osmId, wkt, startLon, startLat, endLon, endLat]
        );
        created++;
      }
    } catch (e) {
      failed++;
      console.error(`  row ${i} (osm_id=${osmId}, name="${name}") failed:`, (e as Error).message);
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  progress: ${i + 1}/${named.length} (created=${created}, updated=${updated}, failed=${failed})`);
    }
  }

  await client.query(
    `INSERT INTO import_batches (id, type, filename, uploaded_by, uploaded_at, row_count, status, error_log)
     VALUES ($1, 'STREETS', $2, $3, now(), $4, 'SUCCESS', $5::jsonb)`,
    [
      crypto.randomUUID(),
      "overpass:relation/" + KFAR_SABA_RELATION_ID,
      adminId,
      named.length,
      JSON.stringify({ created, updated, failed, skippedUnnamed: skipped }),
    ]
  );

  console.log(`Done. Created ${created}, updated ${updated}, failed ${failed}.`);
  await client.end();
}

main().catch((e) => {
  console.error("Import failed:", e);
  process.exit(1);
});
