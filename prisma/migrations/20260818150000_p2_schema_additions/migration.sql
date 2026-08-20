-- CreateEnum
CREATE TYPE "NonCompletionReason" AS ENUM ('BLOCKED', 'WATER_SHORTAGE', 'ACCESS_ISSUE', 'VEHICLE_UNSUITABLE', 'DEFECT', 'OTHER');

-- AlterTable
ALTER TABLE "streets" ADD COLUMN     "created_by" TEXT;

-- AlterTable
ALTER TABLE "task_field_reports" ADD COLUMN     "defect_id" TEXT,
ADD COLUMN     "non_completion_reason" "NonCompletionReason";

-- AlterTable
ALTER TABLE "work_plans" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by" TEXT;

-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "created_by" TEXT;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streets" ADD CONSTRAINT "streets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_field_reports" ADD CONSTRAINT "task_field_reports_defect_id_fkey" FOREIGN KEY ("defect_id") REFERENCES "defects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
