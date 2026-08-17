# Migration notes

## `prisma migrate diff` always wants to drop the GiST indexes — do not let it

The PostGIS `geometry` columns on `zones`, `streets` and `street_segments` are
declared `Unsupported(...)` in `schema.prisma`. Prisma does not model indexes on
unsupported columns, so it does not know the spatial indexes exist. Every
`prisma migrate diff` therefore emits:

```sql
DROP INDEX "zones_geometry_gist_idx";
DROP INDEX "streets_geometry_gist_idx";
DROP INDEX "street_segments_geometry_gist_idx";
```

**Delete those lines from any generated migration before applying it.** Applying
them silently removes the spatial indexes, and every `ST_Contains` /
`ST_Intersection` in `src/server/geo/` degrades to a sequential scan.

The indexes are created by raw SQL in:

- `20260816114504_add_spatial_indexes/migration.sql` — `zones`, `streets`
- `20260817120000_tender_contract_areas_and_provenance/migration.sql` — `street_segments`

## `migrate dev` does not work in this environment

It requires an interactive TTY. Use instead:

```bash
npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script \
  > prisma/migrations/<timestamp>_<name>/migration.sql
# edit: remove the DROP INDEX lines above
npx prisma migrate deploy
```

`ALTER TYPE ... ADD VALUE` cannot run inside a transaction, so Postgres executes
such migrations unwrapped — a failure part-way leaves the database partially
migrated. Writing migrations idempotently (`IF NOT EXISTS`, guarded `DO` blocks,
`DROP CONSTRAINT IF EXISTS` before `ADD CONSTRAINT`) makes them safe to re-run;
`20260817120000` is written that way after it failed on exactly this.
