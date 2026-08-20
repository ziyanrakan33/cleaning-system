-- CreateEnum
CREATE TYPE "DistanceBasis" AS ENUM ('ROAD_NETWORK', 'STRAIGHT_LINE');

-- AlterTable
ALTER TABLE "task_field_reports" ADD COLUMN     "idempotency_key" TEXT;

-- AlterTable
ALTER TABLE "work_plan_tasks" ADD COLUMN     "distance_basis" "DistanceBasis",
ADD COLUMN     "planned_waste_kg" DOUBLE PRECISION,
ADD COLUMN     "projected_waste_after_kg" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "task_field_reports_idempotency_key_key" ON "task_field_reports"("idempotency_key");
