-- Streets table is empty at this point in development, so this is safe.
CREATE UNIQUE INDEX IF NOT EXISTS "streets_osm_id_key" ON "streets" ("osm_id");
