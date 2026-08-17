-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "DefectStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_PROOF', 'FIXED', 'REJECTED', 'APPEALED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "DefectSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "DefectOrigin" AS ENUM ('INSPECTION', 'CALL_CENTER', 'MANAGER', 'CONTRACTOR', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "DeductionStatus" AS ENUM ('NONE', 'PROPOSED', 'APPROVED', 'WAIVED', 'APPLIED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PhotoKind" AS ENUM ('BEFORE', 'AFTER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ComplaintStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "InspectionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "InspectionRound" AS ENUM ('MORNING_10', 'MIDDAY_12', 'AD_HOC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "defect_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deduction_amount" DECIMAL(12,2) NOT NULL,
    "unit_basis" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "default_fix_hours" INTEGER,
    "source_section" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "defect_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "defects" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "defect_type_id" TEXT,
    "zone_id" TEXT,
    "street_id" TEXT,
    "segment_id" TEXT,
    "contract_area_id" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "DefectSeverity" NOT NULL DEFAULT 'MEDIUM',
    "origin" "DefectOrigin" NOT NULL DEFAULT 'INSPECTION',
    "status" "DefectStatus" NOT NULL DEFAULT 'NEW',
    "reported_by" TEXT NOT NULL,
    "assigned_to" TEXT,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3),
    "fixed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "not_done_reason" TEXT,
    "inspector_notes" TEXT,
    "deduction_status" "DeductionStatus" NOT NULL DEFAULT 'NONE',
    "deduction_amount" DECIMAL(12,2),
    "deduction_surcharge_percent" INTEGER,
    "deduction_reason" TEXT,
    "deduction_approved_by" TEXT,
    "deduction_approved_at" TIMESTAMP(3),
    "appeal_text" TEXT,
    "appealed_at" TIMESTAMP(3),
    "appeal_due_at" TIMESTAMP(3),
    "appeal_decision" TEXT,
    "appeal_decided_at" TIMESTAMP(3),
    "appeal_decided_by" TEXT,
    "inspection_id" TEXT,
    "complaint_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "defects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "defect_photos" (
    "id" TEXT NOT NULL,
    "defect_id" TEXT NOT NULL,
    "kind" "PhotoKind" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "caption" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "defect_events" (
    "id" TEXT NOT NULL,
    "defect_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "from_status" "DefectStatus",
    "to_status" "DefectStatus",
    "note" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "complaints" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "reporter_name" TEXT,
    "reporter_phone" TEXT,
    "zone_id" TEXT,
    "street_id" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'NEW',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolution" TEXT,
    "received_by" TEXT NOT NULL,
    "assigned_to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "inspections" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "round" "InspectionRound" NOT NULL DEFAULT 'MORNING_10',
    "zone_id" TEXT,
    "inspector_id" TEXT NOT NULL,
    "contractor_rep" TEXT,
    "status" "InspectionStatus" NOT NULL DEFAULT 'PLANNED',
    "meeting_point" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "defect_types_code_key" ON "defect_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "defects_reference_key" ON "defects"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "defects_status_idx" ON "defects"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "defects_zone_id_idx" ON "defects"("zone_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "defects_contract_area_id_idx" ON "defects"("contract_area_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "defects_due_at_idx" ON "defects"("due_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "defect_photos_defect_id_idx" ON "defect_photos"("defect_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "defect_events_defect_id_created_at_idx" ON "defect_events"("defect_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "complaints_reference_key" ON "complaints"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "complaints_status_idx" ON "complaints"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "complaints_zone_id_idx" ON "complaints"("zone_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inspections_date_idx" ON "inspections"("date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "inspections_date_round_zone_id_key" ON "inspections"("date", "round", "zone_id");

-- AddForeignKey
ALTER TABLE "defects" DROP CONSTRAINT IF EXISTS "defects_defect_type_id_fkey";
ALTER TABLE "defects" ADD CONSTRAINT "defects_defect_type_id_fkey" FOREIGN KEY ("defect_type_id") REFERENCES "defect_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" DROP CONSTRAINT IF EXISTS "defects_zone_id_fkey";
ALTER TABLE "defects" ADD CONSTRAINT "defects_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" DROP CONSTRAINT IF EXISTS "defects_street_id_fkey";
ALTER TABLE "defects" ADD CONSTRAINT "defects_street_id_fkey" FOREIGN KEY ("street_id") REFERENCES "streets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" DROP CONSTRAINT IF EXISTS "defects_segment_id_fkey";
ALTER TABLE "defects" ADD CONSTRAINT "defects_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "street_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" DROP CONSTRAINT IF EXISTS "defects_contract_area_id_fkey";
ALTER TABLE "defects" ADD CONSTRAINT "defects_contract_area_id_fkey" FOREIGN KEY ("contract_area_id") REFERENCES "contract_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" DROP CONSTRAINT IF EXISTS "defects_reported_by_fkey";
ALTER TABLE "defects" ADD CONSTRAINT "defects_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" DROP CONSTRAINT IF EXISTS "defects_assigned_to_fkey";
ALTER TABLE "defects" ADD CONSTRAINT "defects_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" DROP CONSTRAINT IF EXISTS "defects_deduction_approved_by_fkey";
ALTER TABLE "defects" ADD CONSTRAINT "defects_deduction_approved_by_fkey" FOREIGN KEY ("deduction_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" DROP CONSTRAINT IF EXISTS "defects_appeal_decided_by_fkey";
ALTER TABLE "defects" ADD CONSTRAINT "defects_appeal_decided_by_fkey" FOREIGN KEY ("appeal_decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" DROP CONSTRAINT IF EXISTS "defects_inspection_id_fkey";
ALTER TABLE "defects" ADD CONSTRAINT "defects_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" DROP CONSTRAINT IF EXISTS "defects_complaint_id_fkey";
ALTER TABLE "defects" ADD CONSTRAINT "defects_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_photos" DROP CONSTRAINT IF EXISTS "defect_photos_defect_id_fkey";
ALTER TABLE "defect_photos" ADD CONSTRAINT "defect_photos_defect_id_fkey" FOREIGN KEY ("defect_id") REFERENCES "defects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_photos" DROP CONSTRAINT IF EXISTS "defect_photos_uploaded_by_fkey";
ALTER TABLE "defect_photos" ADD CONSTRAINT "defect_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_events" DROP CONSTRAINT IF EXISTS "defect_events_defect_id_fkey";
ALTER TABLE "defect_events" ADD CONSTRAINT "defect_events_defect_id_fkey" FOREIGN KEY ("defect_id") REFERENCES "defects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_events" DROP CONSTRAINT IF EXISTS "defect_events_user_id_fkey";
ALTER TABLE "defect_events" ADD CONSTRAINT "defect_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "complaints_zone_id_fkey";
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "complaints_street_id_fkey";
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_street_id_fkey" FOREIGN KEY ("street_id") REFERENCES "streets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "complaints_received_by_fkey";
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "complaints_assigned_to_fkey";
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "inspections_zone_id_fkey";
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "inspections_inspector_id_fkey";
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "inspections_contractor_rep_fkey";
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_contractor_rep_fkey" FOREIGN KEY ("contractor_rep") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

