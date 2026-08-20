-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ProfileDataMode" AS ENUM ('REQUIRES_REVIEW', 'MANUAL_BASELINE', 'RULE_BASED', 'DATA_INFORMED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ServicePointStatus" AS ENUM ('ACTIVE', 'BROKEN', 'TEMPORARILY_CLOSED', 'REQUIRES_REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ServiceStopKind" AS ENUM ('WATER_REFILL', 'WASTE_DISPOSAL', 'BREAK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "CalcBasis" AS ENUM ('ESTIMATED', 'MEASURED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SurveyProgress" AS ENUM ('COMPLETED', 'NEEDS_RECHECK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "FieldPhotoKind" AS ENUM ('BEFORE', 'AFTER', 'GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- NOTE: `prisma migrate diff` emitted three `DROP INDEX` statements here for
-- zones_geometry_gist_idx / streets_geometry_gist_idx /
-- street_segments_geometry_gist_idx. They were removed by hand, as
-- prisma/migrations/README.md requires: Prisma does not model indexes on
-- Unsupported() geometry columns, so it believes they are stray. Applying them
-- would drop the GiST indexes and turn every ST_Contains / ST_Intersection in
-- src/server/geo/ into a sequential scan.

-- AlterTable
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "external_tracking_id" TEXT,
ADD COLUMN IF NOT EXISTS "external_tracking_url" TEXT,
ADD COLUMN IF NOT EXISTS "is_demo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "tracking_vendor" TEXT;

-- AlterTable
ALTER TABLE "streets" ADD COLUMN IF NOT EXISTS "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "work_plan_tasks" ADD COLUMN IF NOT EXISTS "dirt_score_at_planning" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "planned_water_liters" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "projected_water_after_l" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "water_basis" "CalcBasis";

-- AlterTable
ALTER TABLE "work_plans" ADD COLUMN IF NOT EXISTS "feasibility" JSONB,
ADD COLUMN IF NOT EXISTS "override_approved_by" TEXT,
ADD COLUMN IF NOT EXISTS "override_reason" TEXT,
ADD COLUMN IF NOT EXISTS "planning_explanation" JSONB,
ADD COLUMN IF NOT EXISTS "variant" TEXT;

-- AlterTable
ALTER TABLE "zones" ADD COLUMN IF NOT EXISTS "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "street_cleaning_profiles" (
    "id" TEXT NOT NULL,
    "street_id" TEXT NOT NULL,
    "infrastructure_kind" TEXT,
    "width_m" DOUBLE PRECISION,
    "area_m2" DOUBLE PRECISION,
    "dirt_base_level" INTEGER,
    "dirt_dynamic_level" DOUBLE PRECISION,
    "recommended_frequency" JSONB,
    "planned_clean_min" DOUBLE PRECISION,
    "avg_actual_clean_min" DOUBLE PRECISION,
    "last_cleaned_at" TIMESTAMP(3),
    "pedestrian_traffic" INTEGER,
    "near_school" BOOLEAN,
    "near_commerce" BOOLEAN,
    "near_bus_stop" BOOLEAN,
    "bin_count" INTEGER,
    "tree_count" INTEGER,
    "leaf_fall_level" INTEGER,
    "seasonal_sensitivity" JSONB,
    "special_events" TEXT,
    "requires_water" BOOLEAN NOT NULL DEFAULT false,
    "est_water_liters_per_100m" DOUBLE PRECISION,
    "uses_pressure_wash" BOOLEAN NOT NULL DEFAULT false,
    "preferred_water_point_id" TEXT,
    "preferred_waste_point_id" TEXT,
    "access_issue" BOOLEAN NOT NULL DEFAULT false,
    "narrow_road" BOOLEAN NOT NULL DEFAULT false,
    "blocked_hours" JSONB,
    "permanent_hazards" TEXT,
    "supervisor_note" TEXT,
    "dirt_score" DOUBLE PRECISION,
    "dirt_score_factors" JSONB,
    "dirt_score_at" TIMESTAMP(3),
    "data_mode" "ProfileDataMode" NOT NULL DEFAULT 'REQUIRES_REVIEW',
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'LOW',
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "manually_overridden" BOOLEAN NOT NULL DEFAULT false,
    "manually_overridden_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "street_cleaning_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "street_surveys" (
    "id" TEXT NOT NULL,
    "street_id" TEXT NOT NULL,
    "surveyed_by" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "progress" "SurveyProgress" NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "street_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "water_refill_points" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "zone_id" TEXT,
    "status" "ServicePointStatus" NOT NULL DEFAULT 'REQUIRES_REVIEW',
    "availability_hours" JSONB,
    "connection_type" TEXT,
    "flow_liters_per_min" DOUBLE PRECISION,
    "avg_fill_minutes" DOUBLE PRECISION,
    "avg_wait_minutes" DOUBLE PRECISION,
    "parallel_capacity" INTEGER NOT NULL DEFAULT 1,
    "max_vehicle_width_m" DOUBLE PRECISION,
    "max_vehicle_height_m" DOUBLE PRECISION,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'REQUIRES_REVIEW',
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'LOW',
    "source_type" "SourceType" NOT NULL DEFAULT 'MANUAL_ENTRY',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "water_refill_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "waste_disposal_points" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "zone_id" TEXT,
    "allowed_waste_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availability_hours" JSONB,
    "avg_dump_minutes" DOUBLE PRECISION,
    "avg_wait_minutes" DOUBLE PRECISION,
    "max_vehicle_width_m" DOUBLE PRECISION,
    "max_vehicle_height_m" DOUBLE PRECISION,
    "access_notes" TEXT,
    "status" "ServicePointStatus" NOT NULL DEFAULT 'REQUIRES_REVIEW',
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'REQUIRES_REVIEW',
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'LOW',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waste_disposal_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "resource_operational_profiles" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "water_capacity_l" DOUBLE PRECISION,
    "waste_capacity_kg" DOUBLE PRECISION,
    "min_water_reserve_l" DOUBLE PRECISION,
    "water_l_per_work_hour" DOUBLE PRECISION,
    "water_l_per_clean_km" DOUBLE PRECISION,
    "waste_kg_per_clean_km" DOUBLE PRECISION,
    "width_m" DOUBLE PRECISION,
    "height_m" DOUBLE PRECISION,
    "weight_kg" DOUBLE PRECISION,
    "can_enter_path" BOOLEAN NOT NULL DEFAULT false,
    "can_mount_sidewalk" BOOLEAN NOT NULL DEFAULT false,
    "allowed_road_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avg_work_speed_m_per_min" DOUBLE PRECISION,
    "avg_travel_speed_kmh" DOUBLE PRECISION,
    "avg_fill_minutes" DOUBLE PRECISION,
    "avg_dump_minutes" DOUBLE PRECISION,
    "start_point_lat" DOUBLE PRECISION,
    "start_point_lon" DOUBLE PRECISION,
    "end_point_lat" DOUBLE PRECISION,
    "end_point_lon" DOUBLE PRECISION,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'REQUIRES_REVIEW',
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'LOW',
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_operational_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "shift_reports" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "operator_name" TEXT,
    "license_plate" TEXT,
    "water_start_percent" INTEGER,
    "water_start_liters" DOUBLE PRECISION,
    "waste_tank_state" TEXT,
    "vehicle_condition" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "notes" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "task_field_reports" (
    "id" TEXT NOT NULL,
    "work_plan_task_id" TEXT NOT NULL,
    "reported_by" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "dirt_before" INTEGER,
    "clean_after" INTEGER,
    "water_before_l" DOUBLE PRECISION,
    "water_after_l" DOUBLE PRECISION,
    "water_before_percent" INTEGER,
    "water_after_percent" INTEGER,
    "refill_needed" BOOLEAN NOT NULL DEFAULT false,
    "water_refill_point_id" TEXT,
    "refill_minutes" DOUBLE PRECISION,
    "refill_travel_minutes" DOUBLE PRECISION,
    "waste_dump_needed" BOOLEAN NOT NULL DEFAULT false,
    "waste_disposal_point_id" TEXT,
    "dump_minutes" DOUBLE PRECISION,
    "access_problem" BOOLEAN NOT NULL DEFAULT false,
    "parked_vehicles" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "vehicle_suitable" BOOLEAN NOT NULL DEFAULT true,
    "needs_revisit" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_field_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "field_photos" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "kind" "FieldPhotoKind" NOT NULL DEFAULT 'GENERAL',
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "caption" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "work_plan_service_stops" (
    "id" TEXT NOT NULL,
    "work_plan_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "sequence_order" INTEGER NOT NULL,
    "kind" "ServiceStopKind" NOT NULL,
    "water_refill_point_id" TEXT,
    "waste_disposal_point_id" TEXT,
    "planned_arrival" TIMESTAMP(3) NOT NULL,
    "planned_departure" TIMESTAMP(3) NOT NULL,
    "travel_distance_m" DOUBLE PRECISION,
    "travel_time_min" DOUBLE PRECISION,
    "service_time_min" DOUBLE PRECISION,
    "liters_loaded" DOUBLE PRECISION,
    "reason" TEXT,
    "basis" "CalcBasis" NOT NULL DEFAULT 'ESTIMATED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_plan_service_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "profile_learning_events" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "old_value" DOUBLE PRECISION,
    "new_value" DOUBLE PRECISION,
    "sample_value" DOUBLE PRECISION,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "source_report_id" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "excluded_by" TEXT,
    "excluded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_learning_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "_WaterPointAllowedResourceTypes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WaterPointAllowedResourceTypes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "_WastePointAllowedResourceTypes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WastePointAllowedResourceTypes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "street_cleaning_profiles_street_id_key" ON "street_cleaning_profiles"("street_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "street_cleaning_profiles_dirt_score_idx" ON "street_cleaning_profiles"("dirt_score");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "street_cleaning_profiles_data_mode_idx" ON "street_cleaning_profiles"("data_mode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "street_cleaning_profiles_last_cleaned_at_idx" ON "street_cleaning_profiles"("last_cleaned_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "street_surveys_street_id_created_at_idx" ON "street_surveys"("street_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "street_surveys_progress_idx" ON "street_surveys"("progress");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "water_refill_points_zone_id_status_idx" ON "water_refill_points"("zone_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "water_refill_points_verification_status_idx" ON "water_refill_points"("verification_status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "waste_disposal_points_zone_id_status_idx" ON "waste_disposal_points"("zone_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "resource_operational_profiles_resource_id_key" ON "resource_operational_profiles"("resource_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "shift_reports_date_idx" ON "shift_reports"("date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "shift_reports_resource_id_date_key" ON "shift_reports"("resource_id", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "task_field_reports_work_plan_task_id_idx" ON "task_field_reports"("work_plan_task_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "task_field_reports_created_at_idx" ON "task_field_reports"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "field_photos_entity_type_entity_id_idx" ON "field_photos"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_plan_service_stops_work_plan_id_resource_id_idx" ON "work_plan_service_stops"("work_plan_id", "resource_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "profile_learning_events_entity_type_entity_id_created_at_idx" ON "profile_learning_events"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "profile_learning_events_excluded_idx" ON "profile_learning_events"("excluded");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "_WaterPointAllowedResourceTypes_B_index" ON "_WaterPointAllowedResourceTypes"("B");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "_WastePointAllowedResourceTypes_B_index" ON "_WastePointAllowedResourceTypes"("B");

-- AddForeignKey
ALTER TABLE "work_plans" DROP CONSTRAINT IF EXISTS "work_plans_override_approved_by_fkey";
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_override_approved_by_fkey" FOREIGN KEY ("override_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" DROP CONSTRAINT IF EXISTS "system_settings_updated_by_fkey";
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "street_cleaning_profiles" DROP CONSTRAINT IF EXISTS "street_cleaning_profiles_street_id_fkey";
ALTER TABLE "street_cleaning_profiles" ADD CONSTRAINT "street_cleaning_profiles_street_id_fkey" FOREIGN KEY ("street_id") REFERENCES "streets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "street_cleaning_profiles" DROP CONSTRAINT IF EXISTS "street_cleaning_profiles_preferred_water_point_id_fkey";
ALTER TABLE "street_cleaning_profiles" ADD CONSTRAINT "street_cleaning_profiles_preferred_water_point_id_fkey" FOREIGN KEY ("preferred_water_point_id") REFERENCES "water_refill_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "street_cleaning_profiles" DROP CONSTRAINT IF EXISTS "street_cleaning_profiles_preferred_waste_point_id_fkey";
ALTER TABLE "street_cleaning_profiles" ADD CONSTRAINT "street_cleaning_profiles_preferred_waste_point_id_fkey" FOREIGN KEY ("preferred_waste_point_id") REFERENCES "waste_disposal_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "street_surveys" DROP CONSTRAINT IF EXISTS "street_surveys_street_id_fkey";
ALTER TABLE "street_surveys" ADD CONSTRAINT "street_surveys_street_id_fkey" FOREIGN KEY ("street_id") REFERENCES "streets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "street_surveys" DROP CONSTRAINT IF EXISTS "street_surveys_surveyed_by_fkey";
ALTER TABLE "street_surveys" ADD CONSTRAINT "street_surveys_surveyed_by_fkey" FOREIGN KEY ("surveyed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_refill_points" DROP CONSTRAINT IF EXISTS "water_refill_points_zone_id_fkey";
ALTER TABLE "water_refill_points" ADD CONSTRAINT "water_refill_points_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_disposal_points" DROP CONSTRAINT IF EXISTS "waste_disposal_points_zone_id_fkey";
ALTER TABLE "waste_disposal_points" ADD CONSTRAINT "waste_disposal_points_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_operational_profiles" DROP CONSTRAINT IF EXISTS "resource_operational_profiles_resource_id_fkey";
ALTER TABLE "resource_operational_profiles" ADD CONSTRAINT "resource_operational_profiles_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" DROP CONSTRAINT IF EXISTS "shift_reports_resource_id_fkey";
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" DROP CONSTRAINT IF EXISTS "shift_reports_user_id_fkey";
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_field_reports" DROP CONSTRAINT IF EXISTS "task_field_reports_work_plan_task_id_fkey";
ALTER TABLE "task_field_reports" ADD CONSTRAINT "task_field_reports_work_plan_task_id_fkey" FOREIGN KEY ("work_plan_task_id") REFERENCES "work_plan_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_field_reports" DROP CONSTRAINT IF EXISTS "task_field_reports_reported_by_fkey";
ALTER TABLE "task_field_reports" ADD CONSTRAINT "task_field_reports_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_field_reports" DROP CONSTRAINT IF EXISTS "task_field_reports_water_refill_point_id_fkey";
ALTER TABLE "task_field_reports" ADD CONSTRAINT "task_field_reports_water_refill_point_id_fkey" FOREIGN KEY ("water_refill_point_id") REFERENCES "water_refill_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_field_reports" DROP CONSTRAINT IF EXISTS "task_field_reports_waste_disposal_point_id_fkey";
ALTER TABLE "task_field_reports" ADD CONSTRAINT "task_field_reports_waste_disposal_point_id_fkey" FOREIGN KEY ("waste_disposal_point_id") REFERENCES "waste_disposal_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_photos" DROP CONSTRAINT IF EXISTS "field_photos_uploaded_by_fkey";
ALTER TABLE "field_photos" ADD CONSTRAINT "field_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plan_service_stops" DROP CONSTRAINT IF EXISTS "work_plan_service_stops_work_plan_id_fkey";
ALTER TABLE "work_plan_service_stops" ADD CONSTRAINT "work_plan_service_stops_work_plan_id_fkey" FOREIGN KEY ("work_plan_id") REFERENCES "work_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plan_service_stops" DROP CONSTRAINT IF EXISTS "work_plan_service_stops_resource_id_fkey";
ALTER TABLE "work_plan_service_stops" ADD CONSTRAINT "work_plan_service_stops_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plan_service_stops" DROP CONSTRAINT IF EXISTS "work_plan_service_stops_water_refill_point_id_fkey";
ALTER TABLE "work_plan_service_stops" ADD CONSTRAINT "work_plan_service_stops_water_refill_point_id_fkey" FOREIGN KEY ("water_refill_point_id") REFERENCES "water_refill_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plan_service_stops" DROP CONSTRAINT IF EXISTS "work_plan_service_stops_waste_disposal_point_id_fkey";
ALTER TABLE "work_plan_service_stops" ADD CONSTRAINT "work_plan_service_stops_waste_disposal_point_id_fkey" FOREIGN KEY ("waste_disposal_point_id") REFERENCES "waste_disposal_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_learning_events" DROP CONSTRAINT IF EXISTS "profile_learning_events_excluded_by_fkey";
ALTER TABLE "profile_learning_events" ADD CONSTRAINT "profile_learning_events_excluded_by_fkey" FOREIGN KEY ("excluded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WaterPointAllowedResourceTypes" DROP CONSTRAINT IF EXISTS "_WaterPointAllowedResourceTypes_A_fkey";
ALTER TABLE "_WaterPointAllowedResourceTypes" ADD CONSTRAINT "_WaterPointAllowedResourceTypes_A_fkey" FOREIGN KEY ("A") REFERENCES "resource_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WaterPointAllowedResourceTypes" DROP CONSTRAINT IF EXISTS "_WaterPointAllowedResourceTypes_B_fkey";
ALTER TABLE "_WaterPointAllowedResourceTypes" ADD CONSTRAINT "_WaterPointAllowedResourceTypes_B_fkey" FOREIGN KEY ("B") REFERENCES "water_refill_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WastePointAllowedResourceTypes" DROP CONSTRAINT IF EXISTS "_WastePointAllowedResourceTypes_A_fkey";
ALTER TABLE "_WastePointAllowedResourceTypes" ADD CONSTRAINT "_WastePointAllowedResourceTypes_A_fkey" FOREIGN KEY ("A") REFERENCES "resource_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WastePointAllowedResourceTypes" DROP CONSTRAINT IF EXISTS "_WastePointAllowedResourceTypes_B_fkey";
ALTER TABLE "_WastePointAllowedResourceTypes" ADD CONSTRAINT "_WastePointAllowedResourceTypes_B_fkey" FOREIGN KEY ("B") REFERENCES "waste_disposal_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

