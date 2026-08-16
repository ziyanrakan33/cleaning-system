-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "StreetType" AS ENUM ('STREET', 'PATH', 'PEDESTRIAN_MALL', 'PUBLIC_AREA', 'OTHER');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "FrequencyType" AS ENUM ('DAILY', 'TIMES_PER_WEEK', 'WEEKLY', 'SPECIFIC_DAYS', 'AS_NEEDED');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('OSM', 'MANUAL');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('ACTIVE', 'BROKEN', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'BROKEN', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "WorkPlanStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'NOT_DONE', 'PROBLEM');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('STREETS', 'RESOURCES');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "geometry" geometry(Polygon, 4326),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StreetType" NOT NULL DEFAULT 'STREET',
    "zone_id" TEXT,
    "length_m" DOUBLE PRECISION,
    "start_point_lat" DOUBLE PRECISION,
    "start_point_lon" DOUBLE PRECISION,
    "end_point_lat" DOUBLE PRECISION,
    "end_point_lon" DOUBLE PRECISION,
    "geometry" geometry(LineString, 4326),
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "cleaning_frequency" JSONB NOT NULL,
    "estimated_clean_minutes" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "osm_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "resource_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "resource_type_id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT,
    "assigned_employee_id" TEXT,
    "status" "ResourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "work_hours_start" TEXT,
    "work_hours_end" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_availability" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reason" TEXT,
    "time_override_start" TEXT,
    "time_override_end" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_plans" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "WorkPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parent_version_id" TEXT,

    CONSTRAINT "work_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_plan_tasks" (
    "id" TEXT NOT NULL,
    "work_plan_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "street_id" TEXT NOT NULL,
    "sequence_order" INTEGER NOT NULL,
    "planned_start" TIMESTAMP(3) NOT NULL,
    "planned_end" TIMESTAMP(3) NOT NULL,
    "distance_m" DOUBLE PRECISION,
    "travel_time_min" DOUBLE PRECISION,
    "clean_time_min" DOUBLE PRECISION,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "actual_notes" TEXT,
    "employee_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_plan_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_plan_changes" (
    "id" TEXT NOT NULL,
    "work_plan_id" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_type" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "description" TEXT,

    CONSTRAINT "work_plan_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "street_cleaning_log" (
    "id" TEXT NOT NULL,
    "street_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "work_plan_task_id" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "street_cleaning_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_events" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "telemetry_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "filename" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_count" INTEGER NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "error_log" JSONB,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_StreetAllowedResourceTypes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_StreetAllowedResourceTypes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ResourceAllowedZones" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ResourceAllowedZones_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ResourceAllowedStreets" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ResourceAllowedStreets_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "zones_code_key" ON "zones"("code");

-- CreateIndex
CREATE INDEX "streets_zone_id_idx" ON "streets"("zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_types_name_key" ON "resource_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "resource_types_code_key" ON "resource_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "resources_resource_type_id_identifier_key" ON "resources"("resource_type_id", "identifier");

-- CreateIndex
CREATE INDEX "resource_availability_date_idx" ON "resource_availability"("date");

-- CreateIndex
CREATE UNIQUE INDEX "resource_availability_resource_id_date_key" ON "resource_availability"("resource_id", "date");

-- CreateIndex
CREATE INDEX "work_plans_date_idx" ON "work_plans"("date");

-- CreateIndex
CREATE UNIQUE INDEX "work_plans_date_version_number_key" ON "work_plans"("date", "version_number");

-- CreateIndex
CREATE INDEX "work_plan_tasks_work_plan_id_idx" ON "work_plan_tasks"("work_plan_id");

-- CreateIndex
CREATE INDEX "work_plan_tasks_resource_id_idx" ON "work_plan_tasks"("resource_id");

-- CreateIndex
CREATE INDEX "work_plan_tasks_street_id_idx" ON "work_plan_tasks"("street_id");

-- CreateIndex
CREATE INDEX "work_plan_changes_work_plan_id_idx" ON "work_plan_changes"("work_plan_id");

-- CreateIndex
CREATE INDEX "street_cleaning_log_street_id_date_idx" ON "street_cleaning_log"("street_id", "date");

-- CreateIndex
CREATE INDEX "telemetry_events_resource_id_timestamp_idx" ON "telemetry_events"("resource_id", "timestamp");

-- CreateIndex
CREATE INDEX "_StreetAllowedResourceTypes_B_index" ON "_StreetAllowedResourceTypes"("B");

-- CreateIndex
CREATE INDEX "_ResourceAllowedZones_B_index" ON "_ResourceAllowedZones"("B");

-- CreateIndex
CREATE INDEX "_ResourceAllowedStreets_B_index" ON "_ResourceAllowedStreets"("B");

-- AddForeignKey
ALTER TABLE "streets" ADD CONSTRAINT "streets_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_resource_type_id_fkey" FOREIGN KEY ("resource_type_id") REFERENCES "resource_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_assigned_employee_id_fkey" FOREIGN KEY ("assigned_employee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_availability" ADD CONSTRAINT "resource_availability_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_parent_version_id_fkey" FOREIGN KEY ("parent_version_id") REFERENCES "work_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plan_tasks" ADD CONSTRAINT "work_plan_tasks_work_plan_id_fkey" FOREIGN KEY ("work_plan_id") REFERENCES "work_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plan_tasks" ADD CONSTRAINT "work_plan_tasks_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plan_tasks" ADD CONSTRAINT "work_plan_tasks_street_id_fkey" FOREIGN KEY ("street_id") REFERENCES "streets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plan_changes" ADD CONSTRAINT "work_plan_changes_work_plan_id_fkey" FOREIGN KEY ("work_plan_id") REFERENCES "work_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plan_changes" ADD CONSTRAINT "work_plan_changes_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "street_cleaning_log" ADD CONSTRAINT "street_cleaning_log_street_id_fkey" FOREIGN KEY ("street_id") REFERENCES "streets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "street_cleaning_log" ADD CONSTRAINT "street_cleaning_log_work_plan_task_id_fkey" FOREIGN KEY ("work_plan_task_id") REFERENCES "work_plan_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StreetAllowedResourceTypes" ADD CONSTRAINT "_StreetAllowedResourceTypes_A_fkey" FOREIGN KEY ("A") REFERENCES "resource_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StreetAllowedResourceTypes" ADD CONSTRAINT "_StreetAllowedResourceTypes_B_fkey" FOREIGN KEY ("B") REFERENCES "streets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ResourceAllowedZones" ADD CONSTRAINT "_ResourceAllowedZones_A_fkey" FOREIGN KEY ("A") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ResourceAllowedZones" ADD CONSTRAINT "_ResourceAllowedZones_B_fkey" FOREIGN KEY ("B") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ResourceAllowedStreets" ADD CONSTRAINT "_ResourceAllowedStreets_A_fkey" FOREIGN KEY ("A") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ResourceAllowedStreets" ADD CONSTRAINT "_ResourceAllowedStreets_B_fkey" FOREIGN KEY ("B") REFERENCES "streets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
