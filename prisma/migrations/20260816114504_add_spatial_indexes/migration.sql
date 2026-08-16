-- Spatial (GIST) indexes for PostGIS geometry columns.
-- These columns are declared Unsupported() in schema.prisma, so Prisma
-- Migrate does not manage them automatically; indexed here explicitly.

CREATE INDEX IF NOT EXISTS "zones_geometry_gist_idx" ON "zones" USING GIST ("geometry");
CREATE INDEX IF NOT EXISTS "streets_geometry_gist_idx" ON "streets" USING GIST ("geometry");
