import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * Field photos for surveys, shift openings and execution reports.
 *
 * Same rules as DefectPhoto: bytes live in the database and are served through
 * an authenticated route, never written under /public. A photo of a site is
 * not something anyone who guesses a URL should be able to read.
 */
const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_ENTITIES = ["StreetSurvey", "ShiftReport", "TaskFieldReport", "WaterRefillPoint", "WasteDisposalPoint"];

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  // Anyone who may produce the underlying record may attach a picture to it.
  if (
    !can(session.user.role, "field.report") &&
    !can(session.user.role, "profiles.edit") &&
    !can(session.user.role, "servicePoints.manage")
  ) {
    return NextResponse.json({ error: "אין הרשאה להעלות תמונות" }, { status: 403 });
  }
  // Each photo write is a DB blob insert — cap per-user upload rate so a
  // compromised/malfunctioning client cannot hammer the database with them.
  if (!checkRateLimit(`photo-upload:${session.user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "יותר מדי העלאות — נסו שוב בעוד דקה." }, { status: 429 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "");
  const kindRaw = String(form.get("kind") ?? "GENERAL");
  const caption = form.get("caption") ? String(form.get("caption")) : null;

  if (!ALLOWED_ENTITIES.includes(entityType) || !entityId) {
    return NextResponse.json({ error: "ישות לא תקינה" }, { status: 400 });
  }
  if (!["BEFORE", "AFTER", "GENERAL"].includes(kindRaw)) {
    return NextResponse.json({ error: "סוג תמונה לא תקין" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "ניתן להעלות תמונות JPEG, PNG או WebP בלבד" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "הקובץ גדול מ-6MB" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const photo = await prisma.fieldPhoto.create({
    data: {
      entityType,
      entityId,
      kind: kindRaw as "BEFORE" | "AFTER" | "GENERAL",
      mimeType: file.type,
      sizeBytes: bytes.byteLength,
      data: bytes,
      caption,
      uploadedById: session.user.id,
    },
    select: { id: true, kind: true, caption: true, sizeBytes: true, uploadedAt: true },
  });

  await audit({
    entityType,
    entityId,
    action: "FIELD_PHOTO_ADDED",
    userId: session.user.id,
    after: { photoId: photo.id, kind: kindRaw, sizeBytes: bytes.byteLength },
    description: "נוספה תמונת שטח",
  });

  return NextResponse.json({ ...photo, uploadedAt: photo.uploadedAt.toISOString() }, { status: 201 });
}

/** Lists the photos attached to one entity — metadata only, never the bytes. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const entityType = sp.get("entityType");
  const entityId = sp.get("entityId");
  if (!entityType || !entityId) {
    return NextResponse.json({ error: "חסר entityType או entityId" }, { status: 400 });
  }

  const photos = await prisma.fieldPhoto.findMany({
    where: { entityType, entityId },
    select: { id: true, kind: true, caption: true, sizeBytes: true, uploadedAt: true },
    orderBy: { uploadedAt: "asc" },
  });

  return NextResponse.json(photos.map((p) => ({ ...p, uploadedAt: p.uploadedAt.toISOString() })));
}
