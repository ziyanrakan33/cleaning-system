/**
 * Creates the ten operational cleaning zones read off the zone map photo.
 *
 * Numbers and colours come from the map. Geometry does NOT: the source is a
 * photograph of a paper map on a wall, taken at an angle, with no ground
 * control points — it cannot be georeferenced into trustworthy polygons. Each
 * zone is therefore created with geometry = NULL and REQUIRES_REVIEW, and a
 * manager supplies the boundary by drawing it or importing GeoJSON/KML.
 *
 * The link to a contract area is likewise left null: the tender draft leaves
 * the "קבלן מס' 1:" / "קבלן מס' 2:" zone lists blank (§543-544), so no source
 * states which zone belongs to which contractor.
 *
 *   npx tsx --env-file=.env scripts/seed-operational-zones.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { OPERATIONAL_ZONES, SOURCE_FILES } from "@/server/tender/sourceData";

/** Marks the rows this seed owns, so pre-existing zones are never mistaken for them. */
const SEED_DESCRIPTION_PREFIX = "אזור ניקיון ";

/**
 * Retires every zone that predates the tender data.
 *
 * This matters because one of the pre-tender test zones already occupied code
 * "Z01" and carried a hand-drawn test polygon plus 88 streets. Left alone it
 * would silently become "אזור 1" and present an invented boundary as the real
 * one. Instead the row is renamed out of the way, deactivated, and its street
 * links are released — with the previous assignment written to the audit log so
 * nothing is lost.
 */
async function retireLegacyZones() {
  const all = await prisma.operationalZone.findMany({
    include: { _count: { select: { streets: true } } },
  });
  const legacy = all.filter((z) => !(z.description ?? "").startsWith(SEED_DESCRIPTION_PREFIX));

  for (const z of legacy) {
    const collides = /^Z(0[1-9]|10)$/.test(z.code);
    let code = z.code;
    if (collides) {
      code = `LEGACY-${z.code}`;
      for (let n = 2; await prisma.operationalZone.findUnique({ where: { code } }); n++) {
        code = `LEGACY-${z.code}-${n}`;
      }
    }

    const streets = await prisma.street.findMany({
      where: { zoneId: z.id },
      select: { id: true, name: true },
    });
    if (streets.length > 0) {
      await prisma.street.updateMany({ where: { zoneId: z.id }, data: { zoneId: null } });
      await prisma.auditLog.create({
        data: {
          entityType: "OperationalZone",
          entityId: z.id,
          action: "RETIRE_LEGACY_ZONE",
          before: { code: z.code, name: z.name, streetIds: streets.map((s) => s.id) },
          after: { code, active: false, streetZoneId: null },
          description:
            `אזור בדיקה "${z.name}" (${z.code}) הועבר ללא-פעיל לפני טעינת אזורי המכרז. ` +
            `${streets.length} רחובות נותקו ממנו — השיוך הקודם היה מבוסס על גבול בדיקה ולא על מפת החלוקה.`,
        },
      });
    }

    await prisma.operationalZone.update({
      where: { id: z.id },
      data: {
        code,
        active: false,
        zoneNumber: null,
        contractAreaId: null,
        notes:
          "אזור בדיקה מלפני טעינת נתוני המכרז. הועבר למצב לא-פעיל (מחיקה רכה); הגבול והשיוך שלו אינם מייצגים את מפת החלוקה.",
      },
    });

    console.log(
      `  · אזור ישן "${z.name}" (${z.code} → ${code}) הועבר ללא-פעיל` +
        (streets.length > 0 ? `, ${streets.length} רחובות נותקו ונרשמו ביומן` : "")
    );
  }
  return legacy.length;
}

async function main() {
  const created: string[] = [];
  const updated: string[] = [];

  const retired = await retireLegacyZones();

  for (const z of OPERATIONAL_ZONES) {
    const code = `Z${String(z.zoneNumber).padStart(2, "0")}`;
    const existing = await prisma.operationalZone.findUnique({ where: { code } });

    if (existing) {
      // Never stomp a boundary or an assignment a manager has already made.
      if (existing.manuallyOverridden) {
        console.log(`  · ${code} דולג — סומן כתיקון ידני`);
        continue;
      }
      await prisma.operationalZone.update({
        where: { id: existing.id },
        data: { zoneNumber: z.zoneNumber, color: z.color, active: true },
      });
      updated.push(code);
      continue;
    }

    const zone = await prisma.operationalZone.create({
      data: {
        code,
        name: `אזור ${z.zoneNumber}`,
        zoneNumber: z.zoneNumber,
        color: z.color,
        active: true,
        // No geometry, and no contract area — both unknown from the sources.
        verificationStatus: "REQUIRES_REVIEW",
        contractAreaStatus: "REQUIRES_REVIEW",
        confidence: "LOW",
        description: `אזור ניקיון ${z.zoneNumber} לפי מפת החלוקה. צבע במפה: ${z.mapColor}.`,
        notes: "הגבול הגיאוגרפי ושיוך הקבלן טרם נקבעו — ראה מסך מקורות ואימות.",
      },
    });
    created.push(code);

    await prisma.sourceEvidence.create({
      data: {
        entityType: "OperationalZone",
        entityId: zone.id,
        fieldName: "zoneNumber",
        sourceFile: SOURCE_FILES.zoneMap,
        sourceType: "ZONE_MAP_IMAGE",
        sourceImageRegion: `המספר ${z.zoneNumber} המודפס על השטח הצבוע ב${z.mapColor}`,
        extractedValue: String(z.zoneNumber),
        confidence: "HIGH",
        notes: "מספר האזור והצבע נקראים בוודאות מהצילום.",
      },
    });

    await prisma.sourceEvidence.create({
      data: {
        entityType: "OperationalZone",
        entityId: zone.id,
        fieldName: "geometry",
        sourceFile: SOURCE_FILES.zoneMap,
        sourceType: "ZONE_MAP_IMAGE",
        extractedValue: null,
        confidence: "LOW",
        verificationStatus: "REQUIRES_REVIEW",
        notes:
          "לא ניתן להפיק גבול מדויק: צילום של מפת נייר בזווית, ללא נקודות ציון ידועות. הגבול יוזן ידנית או ייובא כ-GeoJSON/KML.",
      },
    });

    await prisma.sourceEvidence.create({
      data: {
        entityType: "OperationalZone",
        entityId: zone.id,
        fieldName: "contractAreaId",
        sourceFile: SOURCE_FILES.tenderDoc,
        sourceType: "TENDER_DOCUMENT",
        sourceSection: "§542–544",
        extractedValue: null,
        confidence: "LOW",
        verificationStatus: "REQUIRES_REVIEW",
        notes:
          'המכרז מפרט "קבלן מס\' 1:" ו"קבלן מס\' 2:" ומשאיר את רשימות האזורים ריקות. נספח ו\' (המפה האזורית) אינו בין קובצי המקור.',
      },
    });
  }

  console.log(
    `✓ נוצרו ${created.length} אזורים, עודכנו ${updated.length}, הועברו ללא-פעיל ${retired}`
  );

  const zones = await prisma.operationalZone.findMany({
    where: { active: true },
    orderBy: { zoneNumber: "asc" },
    select: { code: true, name: true, contractAreaStatus: true, verificationStatus: true },
  });
  const needBoundary = zones.filter((z) => z.verificationStatus === "REQUIRES_REVIEW").length;
  const needContractor = zones.filter((z) => z.contractAreaStatus === "REQUIRES_REVIEW").length;

  console.log(`\n${zones.length} אזורים פעילים.`);
  console.log(`  · ${needBoundary} ממתינים להגדרת גבול גיאוגרפי`);
  console.log(`  · ${needContractor} ממתינים לשיוך לאזור מכרז`);
  console.log("\nלאחר הזנת גבול לאזור, הרץ את השיוך הגיאוגרפי:");
  console.log("  npx tsx --env-file=.env scripts/run-spatial-join.ts");
}

main()
  .catch((e) => {
    console.error("הזריעה נכשלה:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
