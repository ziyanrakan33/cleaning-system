-- AlterTable
ALTER TABLE "users" ADD COLUMN     "contract_area_id" TEXT;

-- CreateIndex
CREATE INDEX "users_contract_area_id_idx" ON "users"("contract_area_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_contract_area_id_fkey" FOREIGN KEY ("contract_area_id") REFERENCES "contract_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
