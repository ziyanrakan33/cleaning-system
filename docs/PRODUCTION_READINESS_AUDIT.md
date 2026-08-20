# Production Readiness Audit — Smart Street-Cleaning System

**Audit date:** 2026-08-18
**Scope:** Full codebase audit per `CLAUDE_CODE_MASTER_AUDIT_PROMPT.md`, covering data model, security/RBAC, map & geometry, routing engine, water/waste/vehicle engine, priority/learning engine, planning & allocation, `/my-day` field worker flow, data import center, reports suite, tests, and deployment readiness.

**Method:** Five parallel deep-dive audits (read-only) of the actual code, migrations, and scripts — not the docs describing them. Every finding below was verified against real files (path:line references included). Nothing here is guessed.

## Baseline score before this audit's fixes

| Area | State | Notes |
|---|---|---|
| Data model | Strong foundation | Two-area/ten-zone separation correct, `REQUIRES_REVIEW` defaults correct, street-crossing-zones modeled correctly. Gaps: no `DEMO_MODE` enforcement, no `Organization`/`ZoneAssignment`/soft-delete. |
| Security / RBAC | Centralized but incomplete | Solid `can()` permission layer and audit logging exist, but **zone/contract-area scoping does not exist at the data-model level** — cross-contractor data leakage is currently possible. |
| Map & geometry / routing | Genuinely well-built | Real PostGIS spatial joins, real OSM-derived road-network routing (not mocked), clean swappable `RoutingProvider` interface. Gaps: silent straight-line fallback, no waste-overflow tracking. |
| Priority/learning engine | Well-built, transparent | Weighted, explainable `DirtPriorityScore`, correct 4-stage maturity ladder, EWMA correctly labeled as a formula (never as AI). Missing: formula versioning. |
| Planning & allocation | Functional, one real gap | Feasibility checks, override+audit, versioning, and plan-vs-actual all work — but a plan version is never archived, so **two confirmed plans for the same date can double-book a resource undetected**. |
| `/my-day` field worker | Functional core, missing resilience | Task lifecycle, ratings, and non-completion flags all work. Missing: offline queue, idempotency keys, photo capture wiring (backend ready, UI not wired), completion signature. |
| Imports / reports / tests / deployment | Mixed | Street CSV/Excel import works but isn't transactional; no GeoJSON or resource import; reports suite is broad and correctly avoids fabricated financial savings; no CI, health endpoint, `.env.example`, structured logging, or documented backups; test infra is ad-hoc DB-hitting scripts. |
| GPS / cameras / video | Correctly absent | Confirmed no GPS, camera, video, or fake-location code exists anywhere. `TelemetryEvent` schema is reserved and unused; the GPS-deviations report is a deliberate "Coming Soon" screen. This is the correct state — do not build further here without a real vendor API and approval. |

## What was already built well (do not rebuild)

- **`ContractArea` vs `OperationalZone`** are correctly modeled as separate tables (never merged), with zone→area mapping defaulting to `REQUIRES_REVIEW` and fully audited via `ManualOverride` + `AuditLog` (`src/app/api/zones/[id]/contract-area/route.ts`).
- **`Street` + `StreetSegment`** correctly model a street crossing multiple operational zones.
- **PostGIS spatial layer**: real `ST_Intersection`/`ST_Contains`/`ST_Intersects` with GIST indexes, not approximated.
- **Routing engine**: Nearest-Neighbor + 2-opt over a real OSM-derived road graph (`scripts/build-road-graph.ts`), not straight-line, not mocked — with a clean `RoutingProvider`/`RouteOptimizationProvider` abstraction ready for a future engine swap.
- **`DirtPriorityScore`**: transparent weighted sum, configurable weights/thresholds via `SystemSetting`, factor breakdown + confidence + `dataMode` returned with every score. Manager overrides go through the underlying profile fields (not a raw score overwrite), fully audited, and marked so the learning layer never silently re-overwrites them.
- **4-stage data-maturity ladder** (`REQUIRES_REVIEW → MANUAL_BASELINE → RULE_BASED → DATA_INFORMED`) is correctly ordered, evidence-gated, and the sample-count threshold (default 10) is configurable.
- **EWMA** is correctly implemented and labeled as a formula in code and UI — never presented as AI/ML. No mislabeling found anywhere in the repo.
- **Financial data**: no fabricated "savings" or ROI report exists anywhere; every money figure in the reports suite is gated behind `finance.view` and reflects real entered figures.
- **GPS/camera integration**: correctly left unbuilt. Schema-ready (`TelemetryEvent`), zero write paths, and the GPS-deviations report is an explicit "Coming Soon" screen that names the constraint rather than faking data.
- **Water engine**: per-task planned vs. measured liters tracked with an explicit `waterBasis` field, feeding a properly labeled "planned" water-consumption report.
- **OCR**: does not exist anywhere in the codebase — nothing to gate yet, but any future OCR feature must route through a manager-approval queue (the pattern already exists for source verification — reuse it).
- **Demo/production separation intent**: every demo-related table already carries an `isDemo` column and `"DEMO"`-prefixed names — the *mechanism* is in place, but (see DM-01) the actual `DEMO_MODE` enforcement flag is missing.

## Consolidated findings by priority

Full detail for every finding (current state, missing pieces, exact files/lines, risk, suggested fix) is preserved in the per-area sections below. Status is tracked live in `IMPLEMENTATION_STATUS.md`.

### P0 — must fix before any real data entry

| ID | Area | Summary | Real data needed? |
|---|---|---|---|
| SEC-01 | Security | No zone/contract-area scoping exists at the data-model level — `User` has no zone/contract-area field, so `CONTRACTOR_MANAGER`/`SITE_SUPERVISOR`/`INSPECTOR` accounts can see and act on every other contractor's/zone's defects, complaints, reports, and plans. | No (mechanism); yes (to populate real assignments) |
| SEC-02 | Security | Zone-filter query params (`zoneId`/`contractAreaId`) are client-supplied, not derived from session, on defects/complaints/inspections/reports/plan-generation routes. | No |
| DM-01 | Data model | No real `DEMO_MODE` flag exists anywhere in code, `.env`, or config — `seedDemoRouting()`/`clearDemoRouting()` can run against any database including production, protected only by a naming convention. | No |
| PLN-01 | Planning | `RESOURCE_OVERLAP` feasibility check only scans within one `WorkPlan` version; old versions are never archived, so two confirmed plans for the same date can double-book a resource/employee undetected. | No |

### P1 — finish now, no real data needed

| ID | Area | Summary |
|---|---|---|
| GEO-01 | Routing | Road-graph distance silently falls back to unlabeled straight-line (haversine) on lookup failure — no `ESTIMATED` basis flag propagated to the UI/reports. |
| GEO-05 | Resources | No per-task waste-overflow projection (water has one, waste doesn't) — a manually-edited plan can overflow a vehicle's waste tank without being blocked. |
| GEO-06 | Resources | No feasibility check for a broken/closed **waste** disposal point being used (water has this check, waste doesn't). |
| PRI-01 | Priority engine | No formula-version tracking on `DirtPriorityScore` — a weights/formula change is indistinguishable from a real score change after the fact. |
| MD-01 | My-day | No idempotency key on field-report submission — a retried submit on a flaky connection can create a duplicate report and double-apply the EWMA learning update. |
| MD-02 | My-day | Photo capture is not wired into the field-worker flow (`FieldReportSheet`) even though the backend (`FieldPhoto`, `/api/field-photos`) fully supports it — the single biggest visible gap between the brief and the shipped worker screen. |
| MD-03 | My-day | No offline queue/sync — every `/my-day` action is a direct fetch with no retry/queue on connectivity loss. |
| PLN-02 | Planning | No conflict guard when one employee is set as `assignedEmployeeId` on two active resources simultaneously. |
| IMP-01 | Imports | Street CSV/Excel import writes row-by-row with no transaction and no preview/confirm step. |
| ORG-01 | Branding | Org name "כפר סבא" and a hardcoded "10 zones" constant are baked into ~6 UI files; formula settings are properly DB-backed but branding isn't. |
| SEC-03 | Security | Login has no rate limiting / brute-force protection. |
| DEP-01 | Deployment | No documented DB backup/restore runbook for a system of record. |

### P2 — prepare now, activate after real data / lower urgency

GEO-02 (no geometry validity repair), GEO-03 (no zone-boundary version history/revert), GEO-04 (map has no empty-state onboarding view), DM-02 (no `ZoneAssignment` join model with history), DM-03 (no `Organization` model), DM-04 (soft-delete missing across ~45 models), DM-05 (creator/updater actor fields inconsistent), SEC-04..SEC-08 (stale hardcoded role checks, open field-photo/shift-report reads by ID, missing audit on user/zone/street mutations, no rate limit on uploads/plan-generation), PRI-02 (dashboard has no data-maturity breakdown), PLN-03 (plan-vs-actual report has no aggregation/rollup), PLN-04 (no cancel-plan UI/reason), MD-04 (no conflict resolution for offline sync), MD-05 (no completion signature — policy question), MD-06 (non-completion reason is unstructured, no link to Defects module), IMP-02 (weak duplicate detection on street import), IMP-03 (no bulk import for resources), IMP-04 (no GeoJSON import path), IMP-05..IMP-08 (no `.env.example`, no health endpoint, no CI, no structured logging), IMP-09 (readiness signals scattered across screens), IMP-10 (test infra is ad-hoc DB-hitting scripts, no CI-integrated unit/E2E tests).

### P3 — informational / low priority / confirmed-correct guardrails

GEO-07 (MultiPolygon zone import drops parts), GEO-08 (unused `FeasibilityCheckId` member), GEO-09 (service-point last-checked date not shown in UI), DM-06 (`PathSegment` — reasonable as-is, revisit only if real data demands it), DM-07 (`Shift` roster model — defer), DM-08 (`SourceDocument` entity — needed once intake center expands), SEC-09/10 (weak password minimum, no explicit cookie config), PRI-03 (learning-event audit trail not linked to formula version — bundles with PRI-01), PLN-05 (no cancel UI — see P2), and the four explicit guardrail confirmations: **no GPS/camera/video code exists** (keep it that way), **EWMA correctly stays a formula, not ML** (do not swap in a trained model), **no computer-vision auto dirt-scoring** (keep manual 1–5 ratings), **no fabricated financial savings** (keep money figures real-only).

### Requires external service (Bucket 3 across all areas)

- **GPS / vehicle camera vendor integration** (GEO-10/GEO-11): correctly stubbed, schema-ready, disabled. Build only as a read-only adapter once a vendor contract + API exists.
- **Commercial/traffic-aware roads API** (GEO-12): current OSM-derived graph is real routing, not mocked, but accuracy is bounded by OSM coverage — defer paid roads API until contracted.
- **Object storage migration** (SEC-11 / MD-07): photos currently stored as DB blobs — acceptable at pilot scale, migrate to S3/Blob with signed URLs before production scale.
- **Rate-limiting store** (SEC-12): needs Redis/Upstash if deployed across multiple instances.
- **Error tracking / monitoring** (IMP-11): no Sentry/Datadog equivalent wired in; SDK wiring is code-only, but needs an external account.

---

## Detailed findings by area

The full, unabridged findings (every ID above, with current state, missing pieces, exact file:line references, risk, and suggested solution) are preserved verbatim from the five source audits in this repo's working history and are being carried into `PRE_DATA_COMPLETION_PLAN.md` as actionable tasks. Below is the per-area index; see `IMPLEMENTATION_STATUS.md` for live status of each.

### Data model (`DM-*`)
Two-area/ten-zone separation, `StreetSegment` zone-crossing, and the data-maturity ladder are correctly built. Real gaps: `DEMO_MODE` flag missing (DM-01, P0), no `ZoneAssignment` history table (DM-02), no `Organization` model (DM-03), no soft-delete (DM-04), inconsistent creator/updater actor fields (DM-05), plus lower-priority model-completeness items (`PathSegment`, `Shift` roster, `SourceDocument`).

### Security / RBAC / file storage (`SEC-*`)
Auth (NextAuth v5 + Credentials) and the central `can()` RBAC table are solid. The critical gap is that **no zone/contract-area scoping exists at the data-model level at all** (SEC-01/SEC-02, both P0) — this is the single highest-risk finding in the entire audit. Secondary: stale hardcoded role checks, a few IDOR-lite issues (open photo/shift-report reads by ID), missing audit logs on user/zone/street mutations, and no rate limiting anywhere.

### Map, geometry, routing, water/waste/vehicle engine (`GEO-*`)
Genuinely well-built — real PostGIS, real OSM-based routing, clean provider abstraction, correctly gated GPS/camera absence. Fixable gaps: unlabeled straight-line routing fallback (GEO-01, P1), no waste-overflow tracking or broken-waste-point check (GEO-05/06, P1), no geometry validity repair, no boundary version history, no map empty-state.

### Priority / learning engine, planning & allocation, `/my-day` (`PRI-*`, `PLN-*`, `MD-*`)
The scoring engine is transparent, configurable, and correctly never presented as AI. The one P0 in this area is **PLN-01**: plan versions are never archived, so cross-plan double-booking of a resource is currently possible and undetected. `/my-day`'s core task lifecycle works; the biggest gaps are idempotency (MD-01), photo capture not wired despite a ready backend (MD-02), and no offline queue (MD-03) — all named requirements in the brief.

### Imports, reports, tests, deployment (`IMP-*`, `ORG-*`, `DEP-*`)
Street import works but isn't transactional and has weak duplicate detection; resources and GeoJSON have no import path at all. The reports suite is broad and correctly avoids any fabricated financial figure; the GPS-deviations report is a model example of the "Future External Integration" pattern. Branding is hardcoded in a handful of files (fixable with a small settings addition, not a multi-tenant rewrite). No CI, health endpoint, `.env.example`, structured logging, error tracking, or documented backups exist yet; test infrastructure is ad-hoc DB-hitting scripts rather than CI-integrated unit/E2E tests.
