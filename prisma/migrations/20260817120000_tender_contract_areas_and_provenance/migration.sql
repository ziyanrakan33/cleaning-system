-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "VerificationStatus" AS ENUM ('EXTRACTED', 'REQUIRES_REVIEW', 'VERIFIED', 'REJECTED', 'CONFLICTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SourceType" AS ENUM ('TENDER_DOCUMENT', 'BID_TABLE_IMAGE', 'ZONE_MAP_IMAGE', 'GIS_IMPORT', 'OSM_IMPORT', 'MANUAL_ENTRY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ShiftType" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT', 'REST_DAY', 'FLEXIBLE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ResourceCategory" AS ENUM ('SWEEPER_SMALL', 'SWEEPER_MEDIUM', 'SWEEPER_LARGE', 'TASK_VEHICLE', 'MIUL', 'MANUAL_WORKER', 'WASHER', 'TRIMMER', 'SUPERVISOR', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ConflictStatus" AS ENUM ('OPEN', 'RESOLVED', 'ACCEPTED_BOTH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CITY_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DEPT_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'INSPECTOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CONTRACTOR_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SITE_SUPERVISOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'VIEWER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FINANCE';

-- DropForeignKey
ALTER TABLE "_ResourceAllowedZones" DROP CONSTRAINT IF EXISTS "_ResourceAllowedZones_A_fkey";

-- DropForeignKey
ALTER TABLE "_ResourceAllowedZones" DROP CONSTRAINT IF EXISTS "_ResourceAllowedZones_B_fkey";

-- AlterTable
ALTER TABLE "resource_types" ADD COLUMN IF NOT EXISTS     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS     "available_at_night" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "available_on_rest_day" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "capacity_liters" INTEGER,
ADD COLUMN IF NOT EXISTS     "category" "ResourceCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN IF NOT EXISTS     "description" TEXT,
ADD COLUMN IF NOT EXISTS     "requires_driver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "requires_extra_worker" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "requires_gps" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "shift_type" "ShiftType" NOT NULL DEFAULT 'FLEXIBLE',
ADD COLUMN IF NOT EXISTS     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS     "standard_hours" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS     "suitable_for_path" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "suitable_for_road" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS     "suitable_for_sidewalk" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "streets" ADD COLUMN IF NOT EXISTS     "crosses_zones" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "zones" ADD COLUMN IF NOT EXISTS     "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'LOW',
ADD COLUMN IF NOT EXISTS     "contract_area_id" TEXT,
ADD COLUMN IF NOT EXISTS     "contract_area_status" "VerificationStatus" NOT NULL DEFAULT 'REQUIRES_REVIEW',
ADD COLUMN IF NOT EXISTS     "manually_overridden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "notes" TEXT,
ADD COLUMN IF NOT EXISTS     "verification_status" "VerificationStatus" NOT NULL DEFAULT 'REQUIRES_REVIEW',
ADD COLUMN IF NOT EXISTS     "zone_number" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "tenders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "description" TEXT,
    "municipality" TEXT NOT NULL DEFAULT 'כפר סבא',
    "contract_months" INTEGER,
    "option_years" INTEGER,
    "total_infrastructure_km" DOUBLE PRECISION,
    "jurisdiction_km" DOUBLE PRECISION,
    "max_decrease_percent" INTEGER,
    "max_increase_percent" INTEGER,
    "source_file" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "contractors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registration_number" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "contract_areas" (
    "id" TEXT NOT NULL,
    "area_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tender_id" TEXT,
    "contractor_id" TEXT,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'EXTRACTED',
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'MEDIUM',
    "daily_total" DECIMAL(14,2),
    "monthly_total" DECIMAL(14,2),
    "annual_total" DECIMAL(14,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "contract_area_resource_quotas" (
    "id" TEXT NOT NULL,
    "contract_area_id" TEXT NOT NULL,
    "resource_type_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "shift_hours" DOUBLE PRECISION NOT NULL,
    "max_unit_price" DECIMAL(12,2),
    "unit_price" DECIMAL(12,2),
    "daily_total" DECIMAL(14,2),
    "tender_quantity" INTEGER,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'EXTRACTED',
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'MEDIUM',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_area_resource_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "street_segments" (
    "id" TEXT NOT NULL,
    "street_id" TEXT NOT NULL,
    "zone_id" TEXT,
    "segment_index" INTEGER NOT NULL,
    "length_m" DOUBLE PRECISION,
    "geometry" geometry(LineString, 4326),
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'EXTRACTED',
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'MEDIUM',
    "manually_overridden" BOOLEAN NOT NULL DEFAULT false,
    "crosses_zones" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "street_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "source_evidence" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "field_name" TEXT,
    "source_file" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "source_page" INTEGER,
    "source_section" TEXT,
    "source_image_region" TEXT,
    "extracted_value" TEXT,
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'MEDIUM',
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'EXTRACTED',
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "source_conflicts" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "field_name" TEXT,
    "value_a" TEXT NOT NULL,
    "source_a" TEXT NOT NULL,
    "value_b" TEXT NOT NULL,
    "source_b" TEXT NOT NULL,
    "value_c" TEXT,
    "source_c" TEXT,
    "status" "ConflictStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_value" TEXT,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "manual_overrides" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "previous_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT,
    "overridden_by" TEXT NOT NULL,
    "overridden_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "action" TEXT NOT NULL,
    "user_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contractors_name_key" ON "contractors"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contract_areas_area_number_key" ON "contract_areas"("area_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contract_area_resource_quotas_resource_type_id_idx" ON "contract_area_resource_quotas"("resource_type_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contract_area_resource_quotas_contract_area_id_line_number_key" ON "contract_area_resource_quotas"("contract_area_id", "line_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "street_segments_zone_id_idx" ON "street_segments"("zone_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "street_segments_verification_status_idx" ON "street_segments"("verification_status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "street_segments_street_id_segment_index_key" ON "street_segments"("street_id", "segment_index");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "source_evidence_entity_type_entity_id_idx" ON "source_evidence"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "source_evidence_verification_status_idx" ON "source_evidence"("verification_status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "source_conflicts_status_idx" ON "source_conflicts"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "manual_overrides_entity_type_entity_id_idx" ON "manual_overrides"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "zones_zone_number_key" ON "zones"("zone_number");

-- AddForeignKey
ALTER TABLE "contract_areas" DROP CONSTRAINT IF EXISTS "contract_areas_tender_id_fkey";
ALTER TABLE "contract_areas" ADD CONSTRAINT "contract_areas_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_areas" DROP CONSTRAINT IF EXISTS "contract_areas_contractor_id_fkey";
ALTER TABLE "contract_areas" ADD CONSTRAINT "contract_areas_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_area_resource_quotas" DROP CONSTRAINT IF EXISTS "contract_area_resource_quotas_contract_area_id_fkey";
ALTER TABLE "contract_area_resource_quotas" ADD CONSTRAINT "contract_area_resource_quotas_contract_area_id_fkey" FOREIGN KEY ("contract_area_id") REFERENCES "contract_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_area_resource_quotas" DROP CONSTRAINT IF EXISTS "contract_area_resource_quotas_resource_type_id_fkey";
ALTER TABLE "contract_area_resource_quotas" ADD CONSTRAINT "contract_area_resource_quotas_resource_type_id_fkey" FOREIGN KEY ("resource_type_id") REFERENCES "resource_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" DROP CONSTRAINT IF EXISTS "zones_contract_area_id_fkey";
ALTER TABLE "zones" ADD CONSTRAINT "zones_contract_area_id_fkey" FOREIGN KEY ("contract_area_id") REFERENCES "contract_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "street_segments" DROP CONSTRAINT IF EXISTS "street_segments_street_id_fkey";
ALTER TABLE "street_segments" ADD CONSTRAINT "street_segments_street_id_fkey" FOREIGN KEY ("street_id") REFERENCES "streets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "street_segments" DROP CONSTRAINT IF EXISTS "street_segments_zone_id_fkey";
ALTER TABLE "street_segments" ADD CONSTRAINT "street_segments_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_evidence" DROP CONSTRAINT IF EXISTS "source_evidence_verified_by_fkey";
ALTER TABLE "source_evidence" ADD CONSTRAINT "source_evidence_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_conflicts" DROP CONSTRAINT IF EXISTS "source_conflicts_resolved_by_fkey";
ALTER TABLE "source_conflicts" ADD CONSTRAINT "source_conflicts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_overrides" DROP CONSTRAINT IF EXISTS "manual_overrides_overridden_by_fkey";
ALTER TABLE "manual_overrides" ADD CONSTRAINT "manual_overrides_overridden_by_fkey" FOREIGN KEY ("overridden_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_user_id_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Remove orphaned rows in the implicit m2m table before restoring its foreign
-- keys. These rows point at a zone id AND a resource id that no longer exist,
-- so they are dead data; without this the ADD CONSTRAINT below fails (23503).
DELETE FROM "_ResourceAllowedZones" az
WHERE NOT EXISTS (SELECT 1 FROM "zones" z WHERE z.id = az."A")
   OR NOT EXISTS (SELECT 1 FROM "resources" r WHERE r.id = az."B");

-- AddForeignKey
ALTER TABLE "_ResourceAllowedZones" DROP CONSTRAINT IF EXISTS "_ResourceAllowedZones_A_fkey";
ALTER TABLE "_ResourceAllowedZones" ADD CONSTRAINT "_ResourceAllowedZones_A_fkey" FOREIGN KEY ("A") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ResourceAllowedZones" DROP CONSTRAINT IF EXISTS "_ResourceAllowedZones_B_fkey";
ALTER TABLE "_ResourceAllowedZones" ADD CONSTRAINT "_ResourceAllowedZones_B_fkey" FOREIGN KEY ("B") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Spatial (GIST) index for the new street_segments.geometry column. Declared
-- Unsupported() in schema.prisma, so it is indexed here explicitly, matching
-- the pattern in 20260816114504_add_spatial_indexes.
CREATE INDEX IF NOT EXISTS "street_segments_geometry_gist_idx" ON "street_segments" USING GIST ("geometry");
