# Database Backup & Restore

This system's database is Neon Postgres (see `DATABASE_URL` in `.env`, accessed via `@prisma/adapter-neon`). This document records what backup protection exists today and what must be confirmed/added before real municipal data goes in.

## What Neon provides

Neon's paid plans include continuous point-in-time recovery (PITR) — the project can be restored to any point within the plan's retention window (typically 7–30 days depending on tier) without a manual export step. **Action before go-live:** confirm which plan tier this project's Neon organization is on, and what its actual PITR retention window is — do not assume a specific number without checking the Neon console/billing page for this project.

## What this repo does NOT yet have

- No automated `pg_dump` export to separate storage (belt-and-suspenders backup independent of the hosting provider).
- No documented, tested restore drill. PITR existing in principle is not the same as having confirmed a restore actually works for this schema (PostGIS extensions, custom types, etc.).
- No retention policy for `FieldPhoto`/`DefectPhoto` bytes stored in Postgres (see `docs/PRODUCTION_READINESS_AUDIT.md` SEC — file storage is DB-blob-based at pilot scale, which also means these binaries are included in whatever backup/PITR window Neon provides, for better or worse).

## Before real data goes in — checklist

- [ ] Confirm the Neon plan tier and its actual PITR retention window for this project.
- [ ] Perform one real restore test (e.g., restore a branch/point-in-time copy and run `npx prisma migrate status` plus a spot-check query against it) so "we have backups" is a verified fact, not an assumption.
- [ ] Decide whether a supplementary scheduled `pg_dump` (e.g., nightly, stored outside Neon) is wanted for this deployment, given it's a municipal system of record. If yes, add it as a scheduled job (not built in this pass).
- [ ] Revisit this document once real photo volume exists (see `docs/EXTERNAL_INTEGRATIONS.md` §3) — large binary rows affect backup/restore time.

## Who owns this

Not yet assigned — whoever operates the production Neon project should be named here once deployment ownership is decided.
