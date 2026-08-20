import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { setStreetGeometry } from "@/server/geo.service";
import { buildExistingStreetIndex, FREQUENCY_MAP, normalizeStreetName, PRIORITY_MAP, TYPE_MAP, type ImportRow } from "@/server/streets/importParsing";
import type { Prisma } from "@/generated/prisma/client";

const rowSchema = z.object({
  rowNum: z.number(),
  name: z.string().optional(),
  type: z.string().optional(),
  zone: z.string().optional(),
  priority: z.string().optional(),
  frequency: z.string().optional(),
  lengthM: z.number().optional(),
  cleanMinutes: z.number().optional(),
  notes: z.string().optional(),
  startLat: z.number().optional(),
  startLon: z.number().optional(),
  endLat: z.number().optional(),
  endLon: z.number().optional(),
});

const bodySchema = z.object({
  filename: z.string(),
  rows: z.array(rowSchema),
});

/**
 * Phase 2 of the street import (§4): the rows the manager already reviewed
 * via /preview, committed in one transaction — either the whole batch lands
 * or none of it does, and the ImportBatch audit row is written atomically
 * with the data (see docs/PRE_DATA_COMPLETION_PLAN.md IMP-01). Rows with a
 * hard error (no name) are skipped, not written, and counted in `errors`;
 * everything else is written even if it carries a soft warning (e.g. an
 * unrecognized zone name), matching what /preview showed.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "streets.edit")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { filename, rows } = parsed.data as { filename: string; rows: ImportRow[] };

  const zones = await prisma.operationalZone.findMany({ where: { active: true } });
  const zoneByName = new Map(zones.map((z) => [z.name, z.id]));
  // Built once up front (not a findFirst per row, per §IMP-01's own review
  // note) and updated as rows are written so two similarly-named rows in the
  // same file are still caught as duplicates of each other, not just of
  // pre-existing streets.
  const existingIndex = await buildExistingStreetIndex();

  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  // Geometry goes through raw SQL (Unsupported() column) and needs the
  // street's id, which only exists after create/update — queued here and
  // applied inside the same transaction once every row has an id.
  const geometryQueue: { streetId: string; rowNum: number; coords: [number, number][] }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      if (!row.name) {
        errors.push(`שורה ${row.rowNum}: חסר שם רחוב`);
        continue;
      }

      const type = row.type ? TYPE_MAP[row.type] ?? "STREET" : "STREET";
      const priority = row.priority ? PRIORITY_MAP[row.priority] ?? "NORMAL" : "NORMAL";
      const frequencyType = row.frequency ? FREQUENCY_MAP[row.frequency] ?? "WEEKLY" : "WEEKLY";
      const zoneId = row.zone ? zoneByName.get(row.zone) ?? null : null;
      if (row.zone && !zoneId) errors.push(`שורה ${row.rowNum}: אזור "${row.zone}" לא נמצא — הרחוב יובא ללא שיוך`);

      const normalizedName = normalizeStreetName(row.name);
      const existing = existingIndex.get(normalizedName);

      const data = {
        name: row.name,
        type: type as never,
        priority: priority as never,
        cleaningFrequency: { type: frequencyType },
        zoneId,
        estimatedCleanMinutes: row.cleanMinutes ?? null,
        notes: row.notes ?? null,
        source: "MANUAL" as const,
      };

      let streetId: string;
      if (existing) {
        await tx.street.update({ where: { id: existing.id }, data });
        streetId = existing.id;
        updated++;
      } else {
        const createdStreet = await tx.street.create({ data: { ...data, createdById: session.user.id } });
        streetId = createdStreet.id;
        existingIndex.set(normalizedName, { id: streetId, name: row.name });
        created++;
      }

      if (row.startLat != null && row.startLon != null && row.endLat != null && row.endLon != null) {
        geometryQueue.push({
          streetId,
          rowNum: row.rowNum,
          coords: [
            [row.startLon, row.startLat],
            [row.endLon, row.endLat],
          ],
        });
      }
    }

    for (const g of geometryQueue) {
      try {
        await setStreetGeometry(g.streetId, g.coords, tx);
      } catch {
        errors.push(`שורה ${g.rowNum}: קואורדינטות לא תקינות`);
      }
    }

    await tx.importBatch.create({
      data: {
        type: "STREETS",
        filename,
        uploadedById: session.user.id,
        rowCount: rows.length,
        status: errors.length > 0 ? "PARTIAL" : "SUCCESS",
        errorLog: errors.length > 0 ? (errors as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  });

  return NextResponse.json({ created, updated, total: rows.length, errors });
}
