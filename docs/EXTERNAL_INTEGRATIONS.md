# External Integrations

Status of every integration point that depends on something outside this codebase — a vendor contract, an API key, or an external account. Per project rules: cameras, live vehicle location, and video are provided by an **existing external company** and are explicitly **not** to be rebuilt here. Anything in this document that is "disabled/stubbed" must stay that way until the listed precondition is met.

## 1. Vehicle cameras & location (GPS) — vendor-provided, read-only future integration

- **Current state:** Correctly unbuilt. No GPS, live tracking, camera feed, or video-storage code exists anywhere in `src/`. Confirmed via repo-wide search.
- **What exists today, inert:** `TelemetryEvent` model (`prisma/schema.prisma`), explicitly commented "Future GPS / Ituran integration (schema-ready, unused in phase 1)" — zero rows, zero write paths. `Resource.externalTrackingId/externalTrackingUrl/trackingVendor` are reference-only fields, never read by any routing/simulation code.
- **UI today:** `/reports/gps-deviations` renders a deliberate "Coming Soon" screen stating plainly that no GPS/vendor integration is connected and no fabricated data will be shown. This is the correct pattern — keep it.
- **Precondition to build further:** A signed contract/API access with the existing camera/location vendor, plus explicit authorization from the municipality to connect it.
- **When authorized, build it as:** A read-only adapter that writes into the already-reserved `TelemetryEvent` table, guarded by `TelemetryEvent.source` so only trusted vendor-API rows are ever used in reports. Never write synthetic rows for testing into a shared/production table. Do not build live tracking, dashboards, or map pins beyond what the vendor's read-only feed supports.

## 2. Roads API (traffic-aware routing)

- **Current state:** Routing distance/time is computed over a real, self-built graph derived from OpenStreetMap (`scripts/build-road-graph.ts` → `data/kfar-saba-road-graph.json`), consumed via Dijkstra in `src/server/routing/graph.ts`. This is genuine road-network routing, not straight-line, and not mocked.
- **Known gap (fixable without an external service — see `PRE_DATA_COMPLETION_PLAN.md` GEO-01):** when the graph lookup fails or a component is disconnected, it silently falls back to straight-line distance with no `ESTIMATED` label. Fix this now; it does not require a vendor.
- **Precondition to go further:** A contracted commercial roads API (Google/HERE/OSRM-hosted) would be needed for traffic-aware, real-time ETAs. Not required for correctness today — only for accuracy beyond OSM's completeness.
- **When authorized, build it as:** An additional `RoutingProvider` implementation behind the existing swappable interface (`src/server/routing/optimization/provider.ts`), with a documented graceful fallback to the current rule-based/OSM provider on failure.

## 3. Object storage (photos)

- **Current state:** Field photos and defect photos are stored as `bytea` blobs directly in Postgres, served through an authenticated Next.js route with `Cache-Control: private`. This is a deliberate, reasonably secure choice at pilot scale.
- **Precondition to migrate:** Real photo volume from live field use (once MD-02 wires up `/my-day` photo capture) — no urgency before that.
- **When ready, build it as:** S3/Azure Blob/GCS behind the same authenticated route pattern, storing only metadata + a storage key in Postgres, with short-lived signed URLs.

## 4. Rate-limiting store

- **Current state:** No rate limiting exists anywhere (login, uploads, plan generation). An in-DB counter is a viable stopgap that needs no external service (see SEC-03 in the completion plan).
- **Precondition for the "proper" version:** A shared store (Redis/Upstash) is only needed once the app runs across multiple server instances.

## 5. Error tracking / monitoring

- **Current state:** No Sentry/Datadog/equivalent SDK wired in anywhere; only plain console output.
- **Precondition:** An external account/project (e.g., a Sentry org) needs to be created before the SDK wiring is useful — the wiring itself is code-only and can be done now, but the account creation is an external step for whoever owns billing/ops for this project.

## 6. Database backups

- **Current state:** DB is Neon Postgres (`@prisma/adapter-neon`), which has built-in point-in-time recovery on paid plans, but nothing in-repo documents the retention window or a tested restore procedure.
- **Precondition:** Confirm the actual Neon plan tier and its PITR retention window (an account/billing question, not a code question), then document it and test a restore.

## Explicit non-goals (do not build under any circumstances in this phase)

- A second/parallel live-tracking system alongside the vendor's cameras.
- Any video storage or video-based dirt/defect detection.
- Silent or best-effort location tracking of employees.
- Any of the above "unofficial" — i.e., without a signed contract and explicit municipal authorization.
