# Real Data Onboarding Checklist

Everything on this list must come from the municipality, the site supervisor, or the signed tender documents — nothing here should ever be guessed, estimated, or auto-assigned by the system. Until each item is provided and confirmed, the related feature correctly stays in a `REQUIRES_REVIEW` / "pending" state rather than showing fabricated data.

## 1. Contractual structure (needed before SEC-01 zone-scoping is populated)
- [ ] Confirmed list of the **2 tender contract areas** (`ContractArea`) with their real names, contractor company, and contract dates.
- [ ] Confirmed list of the **10 operational zones** (`OperationalZone`) with real names/codes.
- [ ] For each operational zone: which contract area it belongs to (currently defaults to `REQUIRES_REVIEW` — do not bulk-approve without sign-off from the city).
- [ ] For each contractor-side user account (`CONTRACTOR_MANAGER`, `SITE_SUPERVISOR`, `INSPECTOR`): which contract area(s) they should be scoped to. This is required input for the SEC-01 fix in `PRE_DATA_COMPLETION_PLAN.md` — the org chart must come from the city/contractor, not be inferred.
- [ ] Real contract quota values (`ContractAreaResourceQuota`) from the signed tender (current values in `sourceData.ts` are marked `EXTRACTED`/`MEDIUM` confidence from a draft — need re-verification against the signed document).

## 2. Geography
- [ ] Verified boundary polygons for all 10 operational zones (currently `REQUIRES_REVIEW`/`LOW` confidence by default).
- [ ] Verified street list with real multi-vertex geometry (not the straight two-point lines produced by the current Excel import — see IMP-04 GeoJSON import).
- [ ] Confirmation of which streets legitimately cross zone boundaries, for `StreetSegment` review.
- [ ] Real cleaning frequency per street/segment (system currently defaults to `WEEKLY` on import — this default must not be mistaken for a human-confirmed value).
- [ ] Real baseline dirt level per street (feeds `DirtPriorityScore`; currently blank until survey/import).

## 3. Water & waste
- [ ] Verified water refill point locations, hours, flow rate, fill time, vehicle compatibility.
- [ ] Verified waste disposal point locations, hours, service time, vehicle compatibility.
- [ ] Last-checked/verified date for each service point.

## 4. Fleet & staff
- [ ] Real vehicle roster with capacity (water/waste), consumption rate, work speed, passage width, task types, fill/discharge time, access restrictions, working hours (`ResourceOperationalProfile`).
- [ ] Real employee roster with roles and assigned resources.
- [ ] Confirmation of which employee is assigned to which vehicle (needed to exercise the PLN-02 double-assignment guard meaningfully).

## 5. Costs & finance
- [ ] Real contract unit prices, deduction rates, and any other cost figures — **required before any cost/savings figure may ever be shown**. Do not build a savings report until these are entered and verified (see the explicit guardrail in `PRODUCTION_READINESS_AUDIT.md`).

## 6. Formula & policy calibration
- [ ] Sign-off on the default `DirtPriorityScore` weights and thresholds (currently sensible defaults, configurable via Settings — should be reviewed against real city priorities, not just accepted as-is).
- [ ] Decision on `dataInformedMinSamples` (default 10) — confirm this matches how many completed cleanings the city considers "enough evidence."
- [ ] Policy decision on `/my-day` completion signatures (MD-05): is a signature required, and if so, from the worker, a supervisor, or both? This blocks enabling that feature.
- [ ] Confirmation of the branding values for Organization settings (ORG-01): official name, logo, timezone, language, date format.

## 7. External integrations (see `EXTERNAL_INTEGRATIONS.md` for detail)
- [ ] Vendor API credentials and contract terms for the existing camera/location provider, once/if a read-only integration is approved.
- [ ] Decision on whether a commercial/traffic-aware roads API should replace the current OSM-derived road graph.

## What happens without this data

Every screen and report in the system is designed to show its real state honestly when data is missing: `REQUIRES_REVIEW` badges, empty-state onboarding screens, "Coming Soon" for GPS-dependent reports, and zero-value KPIs rather than fabricated numbers. Filling in this checklist is what moves each of those from placeholder state to live state — no code change should be required for that transition once the Phase 0–1 work in `PRE_DATA_COMPLETION_PLAN.md` is complete.
