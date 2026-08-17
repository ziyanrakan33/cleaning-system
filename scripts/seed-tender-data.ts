/**
 * Loads the tender, the two contractors, the two contract areas, the resource
 * catalog and both winners' priced quotas — each with a SourceEvidence row
 * recording exactly where the value came from.
 *
 * Idempotent: re-running updates in place and never duplicates. Values a
 * manager has already verified or overridden are left alone.
 *
 *   npx tsx --env-file=.env scripts/seed-tender-data.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  AREA_1_QUOTAS,
  AREA_2_QUOTAS,
  CONTRACT_AREAS,
  RESOURCE_CATALOG,
  SOURCE_CONFLICTS,
  SOURCE_FILES,
  TENDER,
  verifySourceData,
  type QuotaRow,
} from "@/server/tender/sourceData";

/** Records where one field's value came from, without clobbering a human decision. */
async function recordEvidence(opts: {
  entityType: string;
  entityId: string;
  fieldName: string;
  sourceFile: string;
  sourceType: "TENDER_DOCUMENT" | "BID_TABLE_IMAGE" | "ZONE_MAP_IMAGE";
  sourceSection?: string;
  sourceImageRegion?: string;
  extractedValue: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  notes?: string;
}) {
  const existing = await prisma.sourceEvidence.findFirst({
    where: {
      entityType: opts.entityType,
      entityId: opts.entityId,
      fieldName: opts.fieldName,
    },
  });

  // A manager already ruled on this value — leave their decision intact.
  if (existing && existing.verificationStatus !== "EXTRACTED") return existing;

  const data = {
    entityType: opts.entityType,
    entityId: opts.entityId,
    fieldName: opts.fieldName,
    sourceFile: opts.sourceFile,
    sourceType: opts.sourceType,
    sourceSection: opts.sourceSection ?? null,
    sourceImageRegion: opts.sourceImageRegion ?? null,
    extractedValue: opts.extractedValue,
    confidence: opts.confidence,
    notes: opts.notes ?? null,
  };

  return existing
    ? prisma.sourceEvidence.update({ where: { id: existing.id }, data })
    : prisma.sourceEvidence.create({ data });
}

async function main() {
  const problems = verifySourceData();
  if (problems.length > 0) {
    console.error("נתוני המקור אינם עקביים — הזריעה נעצרה:");
    for (const p of problems) console.error("  ✗", p);
    process.exit(1);
  }
  console.log("✓ נתוני המקור עברו אימות אריתמטי");

  // ---- Tender ----------------------------------------------------------
  let tender = await prisma.tender.findFirst({ where: { name: TENDER.name } });
  const tenderData = {
    name: TENDER.name,
    number: TENDER.number,
    municipality: TENDER.municipality,
    contractMonths: TENDER.contractMonths,
    optionYears: TENDER.optionYears,
    totalInfrastructureKm: TENDER.totalInfrastructureKm,
    jurisdictionKm: TENDER.jurisdictionKm,
    maxDecreasePercent: TENDER.maxDecreasePercent,
    maxIncreasePercent: TENDER.maxIncreasePercent,
    sourceFile: SOURCE_FILES.tenderDoc,
    description:
      "טיוטה סופית. מספר המכרז ותאריכיו ריקים במסמך המקור. חלוקת העיר לשני מרחבי עבודה, מרחב לכל קבלן.",
  };
  tender = tender
    ? await prisma.tender.update({ where: { id: tender.id }, data: tenderData })
    : await prisma.tender.create({ data: tenderData });
  console.log(`✓ מכרז: ${tender.name}`);

  await recordEvidence({
    entityType: "Tender",
    entityId: tender.id,
    fieldName: "totalInfrastructureKm",
    sourceFile: SOURCE_FILES.tenderDoc,
    sourceType: "TENDER_DOCUMENT",
    sourceSection: "§545",
    extractedValue: '197 ק"מ',
    confidence: "HIGH",
    notes: 'סה"כ תשתיות לניקוי, ללא גנים ציבוריים, שצ"פים וחורשות (§546).',
  });
  await recordEvidence({
    entityType: "Tender",
    entityId: tender.id,
    fieldName: "jurisdictionKm",
    sourceFile: SOURCE_FILES.tenderDoc,
    sourceType: "TENDER_DOCUMENT",
    sourceSection: "§919",
    extractedValue: '295 ק"מ',
    confidence: "HIGH",
  });

  // ---- Resource catalog ------------------------------------------------
  const typeIdByCode = new Map<string, string>();
  for (const entry of RESOURCE_CATALOG) {
    const { code, name, tenderQuantity, note, ...attrs } = entry;
    const rt = await prisma.resourceType.upsert({
      where: { code },
      update: { ...attrs, description: note ?? null, active: true },
      create: { code, name, ...attrs, description: note ?? null, active: true },
    });
    typeIdByCode.set(code, rt.id);

    if (tenderQuantity !== null) {
      await recordEvidence({
        entityType: "ResourceType",
        entityId: rt.id,
        fieldName: "tenderQuantity",
        sourceFile: SOURCE_FILES.tenderDoc,
        sourceType: "TENDER_DOCUMENT",
        sourceSection: `נספח ד', טבלה 17, שורה ${entry.sortOrder}`,
        extractedValue: String(tenderQuantity),
        confidence: "HIGH",
      });
    }
  }
  console.log(`✓ קטלוג משאבים: ${RESOURCE_CATALOG.length} סוגים`);

  // Push the pre-tender resource types to the end of the list rather than
  // deleting them — two live resources still point at them.
  const legacy = await prisma.resourceType.updateMany({
    where: { code: { notIn: RESOURCE_CATALOG.map((r) => r.code) } },
    data: { sortOrder: 900 },
  });
  if (legacy.count > 0) {
    console.log(`  · ${legacy.count} סוגי משאב ישנים נשמרו והועברו לסוף הרשימה`);
  }

  // ---- Contract areas + contractors + quotas ---------------------------
  const quotasByArea: Record<number, QuotaRow[]> = { 1: AREA_1_QUOTAS, 2: AREA_2_QUOTAS };

  for (const area of CONTRACT_AREAS) {
    const contractor = await prisma.contractor.upsert({
      where: { name: area.contractorName },
      update: {},
      create: { name: area.contractorName },
    });

    const contractArea = await prisma.contractArea.upsert({
      where: { areaNumber: area.areaNumber },
      update: {
        name: area.name,
        tenderId: tender.id,
        contractorId: contractor.id,
        dailyTotal: area.dailyTotal,
        monthlyTotal: area.monthlyTotal,
        verificationStatus: "VERIFIED",
        confidence: "HIGH",
      },
      create: {
        areaNumber: area.areaNumber,
        name: area.name,
        tenderId: tender.id,
        contractorId: contractor.id,
        dailyTotal: area.dailyTotal,
        monthlyTotal: area.monthlyTotal,
        verificationStatus: "VERIFIED",
        confidence: "HIGH",
      },
    });

    await recordEvidence({
      entityType: "ContractArea",
      entityId: contractArea.id,
      fieldName: "contractorId",
      sourceFile: area.sourceFile,
      sourceType: "BID_TABLE_IMAGE",
      sourceImageRegion: area.sourceImageRegion,
      extractedValue: area.contractorName,
      confidence: "HIGH",
      notes:
        "השיוך נקרא מטקסט מודפס בשני מקומות בלתי-תלויים בתמונה. שים לב: הנחיית העבודה המקורית שייכה את שתי התמונות לאזורים ההפוכים.",
    });

    if (area.monthlyTotal === null) {
      await recordEvidence({
        entityType: "ContractArea",
        entityId: contractArea.id,
        fieldName: "monthlyTotal",
        sourceFile: area.sourceFile,
        sourceType: "BID_TABLE_IMAGE",
        sourceImageRegion: 'שורת "סה"כ לחודש" בתחתית הטבלה',
        extractedValue: "(לא נטען)",
        confidence: "LOW",
        notes:
          'סכומי הסיכום החודשיים של אזור 2 אינם מתיישבים עם הסה"כ היומי כפול מספר ימי העבודה, בניגוד לאזור 1 שהתיישב במדויק. לא נטענו כדי לא להציג מספר לא מאומת.',
      });
      await prisma.sourceEvidence.updateMany({
        where: {
          entityType: "ContractArea",
          entityId: contractArea.id,
          fieldName: "monthlyTotal",
          verificationStatus: "EXTRACTED",
        },
        data: { verificationStatus: "REQUIRES_REVIEW" },
      });
    }

    const rows = quotasByArea[area.areaNumber];
    for (const row of rows) {
      const resourceTypeId = typeIdByCode.get(row.resourceCode)!;
      const catalogEntry = RESOURCE_CATALOG.find((r) => r.code === row.resourceCode)!;

      const quota = await prisma.contractAreaResourceQuota.upsert({
        where: {
          contractAreaId_lineNumber: {
            contractAreaId: contractArea.id,
            lineNumber: row.lineNumber,
          },
        },
        update: {
          resourceTypeId,
          quantity: row.quantity,
          shiftHours: row.shiftHours,
          maxUnitPrice: row.maxUnitPrice,
          unitPrice: row.unitPrice,
          dailyTotal: row.dailyTotal,
          tenderQuantity: catalogEntry.tenderQuantity,
          notes: row.note ?? null,
          confidence: "HIGH",
        },
        create: {
          contractAreaId: contractArea.id,
          resourceTypeId,
          lineNumber: row.lineNumber,
          quantity: row.quantity,
          shiftHours: row.shiftHours,
          maxUnitPrice: row.maxUnitPrice,
          unitPrice: row.unitPrice,
          dailyTotal: row.dailyTotal,
          tenderQuantity: catalogEntry.tenderQuantity,
          notes: row.note ?? null,
          confidence: "HIGH",
        },
      });

      await recordEvidence({
        entityType: "ContractAreaResourceQuota",
        entityId: quota.id,
        fieldName: "quantity",
        sourceFile: area.sourceFile,
        sourceType: "BID_TABLE_IMAGE",
        sourceImageRegion: `שורה ${row.lineNumber}, עמודת "כמות"`,
        extractedValue: String(row.quantity),
        confidence: "HIGH",
        notes: row.note,
      });
    }

    console.log(
      `✓ ${area.name} → ${area.contractorName} (${rows.length} שורות משאבים, ` +
        `${area.dailyTotal.toLocaleString("he-IL")} ₪ ליום)`
    );
  }

  // ---- Conflicts -------------------------------------------------------
  for (const c of SOURCE_CONFLICTS) {
    const existing = await prisma.sourceConflict.findFirst({ where: { topic: c.topic } });
    // Do not reopen or overwrite a conflict a manager has already settled.
    if (existing && existing.status !== "OPEN") continue;

    const data = {
      topic: c.topic,
      valueA: c.valueA,
      sourceA: c.sourceA,
      valueB: c.valueB,
      sourceB: c.sourceB,
      valueC: c.valueC ?? null,
      sourceC: c.sourceC ?? null,
      notes: c.notes || null,
    };
    if (existing) {
      await prisma.sourceConflict.update({ where: { id: existing.id }, data });
    } else {
      await prisma.sourceConflict.create({ data });
    }
  }
  const openConflicts = await prisma.sourceConflict.count({ where: { status: "OPEN" } });
  console.log(`✓ סתירות בין מקורות: ${SOURCE_CONFLICTS.length} נטענו, ${openConflicts} פתוחות`);

  console.log("\nהזריעה הושלמה. נותר לקביעת מנהל ב-/sources:");
  console.log("  · שיוך כל אחד מ-10 האזורים התפעוליים לאזור מכרז");
  console.log("  · גבולות גיאוגרפיים ל-10 האזורים");
  console.log(`  · ${openConflicts} סתירות בין המקורות`);
}

main()
  .catch((e) => {
    console.error("הזריעה נכשלה:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
