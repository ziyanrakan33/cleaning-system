/**
 * Loads the agreed-deduction catalog from the tender's fines table.
 *
 * Idempotent by code. A type a manager has deactivated stays deactivated.
 *
 *   npx tsx --env-file=.env scripts/seed-defect-types.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  DEFECT_CATALOG_SOURCE,
  DEFECT_TYPES,
  EXCLUDED_FROM_CATALOG,
  verifyDefectCatalog,
} from "@/server/tender/defectCatalog";
import { SOURCE_FILES } from "@/server/tender/sourceData";

async function main() {
  const problems = verifyDefectCatalog();
  if (problems.length > 0) {
    console.error("קטלוג הליקויים אינו עקבי — הזריעה נעצרה:");
    for (const p of problems) console.error("  ✗", p);
    process.exit(1);
  }
  console.log("✓ קטלוג הליקויים עבר אימות");

  for (const t of DEFECT_TYPES) {
    const row = await prisma.defectType.upsert({
      where: { code: t.code },
      update: {
        name: t.name,
        deductionAmount: t.deductionAmount,
        unitBasis: t.unitBasis,
        category: t.category,
        defaultFixHours: t.defaultFixHours,
        sortOrder: t.sortOrder,
        notes: t.notes ?? null,
        sourceSection: DEFECT_CATALOG_SOURCE,
      },
      create: {
        code: t.code,
        name: t.name,
        deductionAmount: t.deductionAmount,
        unitBasis: t.unitBasis,
        category: t.category,
        defaultFixHours: t.defaultFixHours,
        sortOrder: t.sortOrder,
        notes: t.notes ?? null,
        sourceSection: DEFECT_CATALOG_SOURCE,
      },
    });

    const existing = await prisma.sourceEvidence.findFirst({
      where: { entityType: "DefectType", entityId: row.id, fieldName: "deductionAmount" },
    });
    if (!existing || existing.verificationStatus === "EXTRACTED") {
      const data = {
        entityType: "DefectType",
        entityId: row.id,
        fieldName: "deductionAmount",
        sourceFile: SOURCE_FILES.tenderDoc,
        sourceType: "TENDER_DOCUMENT" as const,
        sourceSection: DEFECT_CATALOG_SOURCE,
        extractedValue: `${t.deductionAmount} ₪ — ${t.unitBasis}`,
        confidence: "HIGH" as const,
      };
      if (existing) await prisma.sourceEvidence.update({ where: { id: existing.id }, data });
      else await prisma.sourceEvidence.create({ data });
    }
  }

  const byCategory = new Map<string, number>();
  for (const t of DEFECT_TYPES) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + 1);

  console.log(`✓ נטענו ${DEFECT_TYPES.length} סוגי ליקוי:`);
  for (const [cat, n] of byCategory) console.log(`    ${cat}: ${n}`);

  const amounts = DEFECT_TYPES.map((t) => t.deductionAmount);
  console.log(
    `  טווח קיזוזים: ${Math.min(...amounts).toLocaleString("he-IL")}–${Math.max(...amounts).toLocaleString("he-IL")} ₪`
  );

  for (const ex of EXCLUDED_FROM_CATALOG) {
    console.log(`  · לא נטען: "${ex.name}" (${ex.deductionAmount} ₪) — ${ex.reason}`);
  }
}

main()
  .catch((e) => {
    console.error("הזריעה נכשלה:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
