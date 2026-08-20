# Pre-Data Completion Plan

Execution roadmap for everything that can be finished **before** real municipal data is entered. Derived from `PRODUCTION_READINESS_AUDIT.md`. Live status tracked in `IMPLEMENTATION_STATUS.md` — this file is the plan, not the log.

Rule for every task below: no invented data, no unfounded zone/area assignments, no fabricated GPS/financial figures. Demo data only under a real `DEMO_MODE` flag.

## Phase 0 — P0 (blocking, do first)

1. **SEC-01/SEC-02 — Zone/contract-area scoping.** Add a nullable `contractAreaId` (or a `UserZone` join table) to `User`. Build a `scopeWhereForUser()` helper and apply it to every list/detail/mutation query gated by `defects.view`, `complaints.manage`, `reports.view`, `plans.edit`, `inspections.manage`, `servicePoints.manage`. For `CONTRACTOR_MANAGER`/`SITE_SUPERVISOR` roles, an unset `contractAreaId` should mean "not yet assigned — show an empty/pending screen," never "unrestricted." Ship this now with all real assignments left null (fails safe); populate real assignments during onboarding (see `REAL_DATA_ONBOARDING_CHECKLIST.md`).
2. **DM-01 — Real `DEMO_MODE` flag.** Add `DEMO_MODE=true|false` to env config. `seedDemoRouting()`/`clearDemoRouting()` (and `scripts/seed-demo-roles.ts`) must throw if `DEMO_MODE` is not explicitly `true`, and should additionally refuse to run when `NODE_ENV=production` unless explicitly overridden. Add a persistent "demo data present" UI banner when any `isDemo` rows exist. Require `SEED_DEMO_PASSWORD` to be set explicitly (no hardcoded default).
3. **PLN-01 — Cross-plan double-booking.** On transition to `CONFIRMED`, atomically archive any other `CONFIRMED` `WorkPlan` for the same date (single-active-plan-per-date invariant). Extend `RESOURCE_OVERLAP` to also query other non-archived plans for the same date/resource before returning `ok: true`.

## Phase 1 — P1 (finish now, no real data needed)

4. **GEO-01 — Label routing distance basis.** `roadNetworkRouting.distanceMeters` returns `{ meters, basis }`; thread `basis` through `RouteEvent` → `WorkPlanTask.distanceBasis`; surface `ESTIMATED` in the UI/feasibility instead of silently degrading to straight-line.
5. **GEO-05/GEO-06 — Waste parity with water.** Add `plannedWasteKg`/`projectedWasteAfterKg` to `WorkPlanTask`; add a real overflow check; add a `WASTE_POINT_AVAILABLE` feasibility check mirroring the water one.
6. **PRI-01/PRI-03 — Formula versioning.** Add a `DIRT_SCORE_FORMULA_VERSION` constant, store it in `dirtScoreFactors.formulaVersion`, render it next to the computed-at date, and join `ProfileLearningEvent` views against it.
7. **MD-01 — Idempotency on field reports.** Client generates a UUID per submit attempt; add a nullable unique `idempotencyKey` on `TaskFieldReport`; server find-or-creates on that key before running `learnFromTaskFieldReport`.
8. **MD-02 — Wire photo capture into `/my-day`.** Add before/after photo capture to `FieldReportSheet`, uploading to the existing `/api/field-photos` with `entityType: TaskFieldReport`.
9. **MD-03 — Offline queue.** IndexedDB-backed outbox for status/field-report/shift-report submissions; optimistic UI; background sync on reconnect; each queued item carries the idempotency key from #7.
10. **PLN-02 — Employee double-assignment guard.** On `PATCH /api/resources/[id]`, block (or require confirmation, reusing the existing `QuotaExceededError` 409 pattern) if `assignedEmployeeId` is already active on another resource.
11. **IMP-01 — Transactional street import.** Two-phase flow: parse+validate+preview (no writes) → confirm → `prisma.$transaction` write, keeping the existing `ImportBatch` audit row atomic with the write.
12. **ORG-01 — De-hardcode branding.** Add an `OrganizationSetting` (reuse the `system_settings` key/value + audit pattern already used for scoring weights) for name/logo/color/timezone/language/date-format/feature-flags; replace the ~6 literal-string call sites and the hardcoded "10 zones" UI copy.
13. **SEC-03 — Login rate limiting.** Add an in-DB or Redis-backed failed-attempt counter with lockout/backoff inside `authorize()`.
14. **DEP-01 — Backup runbook.** Document Neon's PITR/retention for this project's plan tier in `docs/backup.md`; decide on a supplementary scheduled `pg_dump` export.

## Phase 2 — P2 (prepare now, lower urgency / benefits from later real-data verification)

- GEO-02 geometry validity repair (`ST_MakeValid` before persisting).
- GEO-03 zone-boundary version history + revert (currently only in-session undo).
- GEO-04 map empty-state/onboarding view when DB has no zones/streets.
- DM-02 `ZoneAssignment` history table (validFrom/validTo/reason) — build once real assignment cadence is known.
- DM-03 `Organization` model (may fold into ORG-01's `OrganizationSetting`).
- DM-04 soft-delete on `Defect`/`Complaint`/`Inspection`/`ContractArea`/`OperationalZone`/`WorkPlan`; change evidence-child cascades to `Restrict`.
- DM-05 consistent `createdById`/`updatedById` on master-data models.
- SEC-04 replace stale hardcoded `role === "ADMIN"` checks with `can()`.
- SEC-05/06 scope field-photo and shift-report reads (depends on #1).
- SEC-07 audit log on user/zone/street create-update-delete.
- SEC-08 rate limit uploads and plan-generation.
- PRI-02 dashboard data-maturity breakdown (group by `dataMode`, count active overrides).
- PLN-03 plan-vs-actual aggregation/rollup + date-range view.
- PLN-04 cancel-plan UI with required reason (reuse the override-reason UX).
- MD-04 conflict resolution for offline sync (version/updatedAt stamp check).
- MD-05 completion signature — **needs a municipal policy decision** on whether/who signs; build the capture UI behind a settings flag so it can be toggled on once decided.
- MD-06 structured non-completion reason enum + a "raise a defect" shortcut linking `/my-day` to the Defects module.
- IMP-02 fuzzy/normalized duplicate detection on street import.
- IMP-03 bulk import for resources (mirror the street-import pattern).
- IMP-04 GeoJSON import path for real multi-vertex street geometry.
- IMP-05 `.env.example`.
- IMP-06 health-check endpoint.
- IMP-07 CI workflow (lint/typecheck/build at minimum).
- IMP-08 structured logging (pino or similar).
- IMP-09 consolidate readiness signals into one dashboard section.
- IMP-10 real unit-test layer (Vitest) + Playwright Test config so smoke scripts run headlessly in CI.

## Phase 3 — P3 / informational (do only if trivial, or skip)

GEO-07 MultiPolygon zone import truncation, GEO-08 unused `FeasibilityCheckId` member, GEO-09 show `lastCheckedAt` in service-point panel, DM-06/07/08 (`PathSegment`, `Shift` roster, `SourceDocument` — defer until real data shows the need), SEC-09/10 (password minimum length, explicit cookie config).

## Explicit guardrails — do NOT build in this phase

- No new GPS, live tracking, cameras, video storage, or video analysis.
- No swap of the EWMA formula for a trained ML model; no marketing it as "AI-powered."
- No computer-vision auto dirt-scoring from photos — dirt/clean ratings stay manual, crew-observed.
- No financial-savings or ROI figures — every money figure must stay real, entered, and finance-gated.
- No full multi-tenant rewrite — the branding fix (#12) is a small settings addition, not a schema-wide tenant partitioning.
- No zone/street/water-point assignment guessed without a source — everything defaults to `REQUIRES_REVIEW`.
- No OCR auto-ingest without a manager-approval queue (not built yet; if built later, must route through the existing source-verification review pattern).

## Sequencing note

Phase 0 items are independent of each other and can proceed in parallel. Phase 1 items MD-01/MD-02/MD-03 should land in that order (idempotency before photo capture before offline queue, since the queue needs the idempotency key). Everything in Phase 1–3 is buildable without real municipal data; tasks that say "benefits from real data" are still built now and simply become more meaningful once real records exist.
